import $ from 'jquery'
import map from 'lodash/map'
import merge from 'lodash/merge'
import URI from 'urijs'
import humps from 'humps'
import listMorph from '../lib/list_morph'
import reduceReducers from 'reduce-reducers'
import { createStore, connectElements } from '../lib/redux_helpers.js'
import '../app'

const maxPageNumberInOneLine = 7
const groupedPagesNumber = 3

var enableFirstLoading = true

export const asyncInitialState = {
  /* it will consider any query param in the current URI as paging */
  beyondPageOne: (URI(window.location).query() !== ''),
  /* will be sent along with { type: 'JSON' } to controller, useful for dynamically changing parameters */
  additionalParams: {},
  /* an array with every html element of the list being shown */
  items: [],
  /* the key for diffing the elements in the items array */
  itemKey: null,
  /* represents whether a request is happening or not */
  loading: false,
  /* if there was an error fetching items */
  requestError: false,
  /* if response has no items */
  emptyResponse: false,
  /* link to the current page */
  currentPagePath: null,
  /* link to the next page */
  nextPagePath: null,
  /* link to the previous page */
  prevPagePath: null,
  /* visited pages */
  pagesStack: []
}

export function asyncReducer (state = asyncInitialState, action) {
  switch (action.type) {
    case 'ELEMENTS_LOAD': {
      return Object.assign({}, state, {
        nextPagePath: action.nextPagePath,
        currentPagePath: action.nextPagePath
      })
    }
    case 'ADD_ITEM_KEY': {
      return Object.assign({}, state, { itemKey: action.itemKey })
    }
    case 'START_REQUEST': {
      return Object.assign({}, state, {
        loading: true,
        requestError: false,
        currentPagePath: action.path
      })
    }
    case 'REQUEST_ERROR': {
      return Object.assign({}, state, { requestError: true })
    }
    case 'FINISH_REQUEST': {
      return Object.assign({}, state, {
        loading: false
      })
    }
    case 'ITEMS_FETCHED': {
      console.log(action)
      let prevPagePath = null

      if (state.pagesStack.length >= 2) {
        prevPagePath = state.pagesStack[state.pagesStack.length - 2]
      }

      return Object.assign({}, state, {
        requestError: false,
        emptyResponse: action.items.length === 0,
        items: action.items,
        anchor: action.nextPageParams,
        pagesLimit: action.nextPageParams.pagesLimit,
        currentPageNumber: action.nextPageParams.pageNumber
      })
    }
    case 'NAVIGATE_TO_OLDER': {
      history.replaceState({}, null, state.nextPagePath)

      if (state.pagesStack.length === 0) {
        if (window.location.pathname.includes('/search-results')) {
          const urlParams = new URLSearchParams(window.location.search)
          const queryParam = urlParams.get('q')
          state.pagesStack.push(window.location.href.split('?')[0] + `?q=${queryParam}`)
        } else {
          state.pagesStack.push(window.location.href.split('?')[0])
        }
      }

      if (state.pagesStack[state.pagesStack.length - 1] !== state.nextPagePath) {
        state.pagesStack.push(state.nextPagePath)
      }

      return Object.assign({}, state, { beyondPageOne: true })
    }
    case 'NAVIGATE_TO_NEWER': {
      history.replaceState({}, null, state.prevPagePath)

      state.pagesStack.pop()

      return Object.assign({}, state, { beyondPageOne: true })
    }
    default:
      return state
  }
}

export const elements = {
  '[data-async-listing]': {
    load ($el) {
      const nextPagePath = $el.data('async-listing')

      return { nextPagePath }
    }
  },
  '[data-async-listing] [data-loading-message]': {
    render ($el, state) {
      if (state.loading) return $el.show()

      $el.hide()
    }
  },
  '[data-async-listing] [data-empty-response-message]': {
    render ($el, state) {
      if (
        !state.requestError &&
        (!state.loading) &&
        state.items.length === 0
      ) {
        return $el.show()
      }

      $el.hide()
    }
  },
  '[data-async-listing] [data-error-message]': {
    render ($el, state) {
      if (state.requestError) return $el.show()

      $el.hide()
    }
  },
  '[data-async-listing] [data-items]': {
    render ($el, state, oldState) {
      if (state.items === oldState.items) return

      if (state.itemKey) {
        const container = $el[0]
        const newElements = map(state.items, (item) => $(item)[0])
        listMorph(container, newElements, { key: state.itemKey })
        return
      }

      $el.html(state.items)
    }
  },
  '[data-async-listing] [data-next-page-button]': {
    render ($el, state) {
      if (state.emptyResponse) {
        return $el.hide()
      }

      $el.show()
      if (state.requestError || !state.nextPagePath || state.loading) {
        return $el.attr('disabled', 'disabled')
      }

      $el.attr('disabled', false)
      $el.attr('href', state.nextPagePath)
    }
  },
  '[data-async-listing] [data-prev-page-button]': {
    render ($el, state) {
      if (state.emptyResponse) {
        return $el.hide()
      }

      $el.show()
      if (state.requestError || !state.prevPagePath || state.loading) {
        return $el.attr('disabled', 'disabled')
      }

      $el.attr('disabled', false)
      $el.attr('href', state.prevPagePath)
    }
  },
  '[data-async-listing] [data-first-page-button]': {
    render ($el, state) {
      if (state.pagesStack.length === 0) {
        return $el.hide()
      }

      const urlParams = new URLSearchParams(window.location.search)
      const blockParam = urlParams.get('block_type')
      const queryParam = urlParams.get('q')
      const firstPageHref = window.location.href.split('?')[0]

      $el.show()
      $el.attr('disabled', false)

      var url
      if (blockParam !== null) {
        url = firstPageHref + '?block_type=' + blockParam
      } else {
        url = firstPageHref
      }

      if (queryParam !== null) {
        url = firstPageHref + '?q=' + queryParam
      } else {
        url = firstPageHref
      }

      $el.attr('href', url)
    }
  },
  '[data-async-listing] [pages-numbers-container]': {
    render ($el, state) {
        pagesNumbersGenerate(state.pagesLimit, $el, state.currentPageNumber)
    }
  },
  '[data-async-listing] [data-loading-button]': {
    render ($el, state) {
      if (state.loading) return $el.show()

      $el.hide()
    }
  },
  '[data-async-listing] [data-pagination-container]': {
    render ($el, state) {
      if (state.emptyResponse) {
        return $el.hide()
      }

      $el.show()
    }
  },
  '[csv-download]': {
    render ($el, state) {
      if (state.emptyResponse) {
        return $el.hide()
      }
      return $el.show()
    }
  }
}

/**
 * Create a store combining the given reducer and initial state with the async reducer.
 *
 * reducer: The reducer that will be merged with the asyncReducer to add async
 * loading capabilities to a page. Any state changes in the reducer passed will be
 * applied AFTER the asyncReducer.
 *
 * initialState: The initial state to be merged with the async state. Any state
 * values passed here will overwrite the values on asyncInitialState.
 *
 * itemKey: it will be added to the state as the key for diffing the elements and
 * adding or removing with the correct animation. Check list_morph.js for more informantion.
 */
export function createAsyncLoadStore (reducer, initialState, itemKey) {
  const state = merge(asyncInitialState, initialState)
  const store = createStore(reduceReducers(asyncReducer, reducer, state))

  if (typeof itemKey !== 'undefined') {
    store.dispatch({
      type: 'ADD_ITEM_KEY',
      itemKey
    })
  }

  connectElements({ store, elements })
  firstPageLoad(store)
  return store
}

export function refreshPage (store) {
  loadPage(store, store.getState().currentPagePath)
}

export function loadPage (store, path) {
  store.dispatch({ type: 'START_REQUEST', path })
  $.getJSON(path, merge({ type: 'JSON' }, store.getState().additionalParams))
    .done(response => store.dispatch(Object.assign({ type: 'ITEMS_FETCHED' }, humps.camelizeKeys(response))))
    .fail(() => store.dispatch({ type: 'REQUEST_ERROR' }))
    .always(() => store.dispatch({ type: 'FINISH_REQUEST' }))
}

function firstPageLoad (store) {
  const $element = $('[data-async-listing]')
  function loadItemsNext () {
    loadPage(store, store.getState().nextPagePath)
  }

  function loadItemsPrev () {
    loadPage(store, store.getState().prevPagePath)
  }

  if (enableFirstLoading) {
    loadItemsNext()
  }

  $element.on('click', '[data-error-message]', (event) => {
    event.preventDefault()
    loadItemsNext()
  })

  $element.on('click', '[data-next-page-button]', (event) => {
    event.preventDefault()
    loadItemsNext()
    store.dispatch({ type: 'NAVIGATE_TO_OLDER' })
    event.stopImmediatePropagation()
  })

  $element.on('click', '[data-prev-page-button]', (event) => {
    event.preventDefault()
    loadItemsPrev()
    store.dispatch({ type: 'NAVIGATE_TO_NEWER' })
    event.stopImmediatePropagation()
  })
}

const $element = $('[data-async-load]')
if ($element.length) {
  if (Object.prototype.hasOwnProperty.call($element.data(), 'noFirstLoading')) {
    enableFirstLoading = false
  }
  if (enableFirstLoading) {
    const store = createStore(asyncReducer)
    connectElements({ store, elements })
    firstPageLoad(store)
  }
}

function pagesNumbersGenerate(pagesLimit, $container, currentPageNumber){
    var resultHTML = ''
    if (pagesLimit < 1)
        return
    if (pagesLimit <= maxPageNumberInOneLine) {
        resultHTML = renderPaginationElements(1, pagesLimit, currentPageNumber)
    } else if (currentPageNumber <= groupedPagesNumber) {
        resultHTML += renderPaginationElements(1, groupedPagesNumber, currentPageNumber)
        resultHTML += renderPaginationElement('...', false)
        resultHTML += renderPaginationElement(pagesLimit, currentPageNumber == pagesLimit)
    } else {
        resultHTML += renderPaginationElement(1, currentPageNumber == 1)
        resultHTML += renderPaginationElement('...', false)
        var step = parseInt(groupedPagesNumber / 2)
        resultHTML += renderPaginationElements(currentPageNumber - step, currentPageNumber + step, currentPageNumber)
        resultHTML += renderPaginationElement('...', false)
        resultHTML += renderPaginationElement(pagesLimit, currentPageNumber == pagesLimit)
    }

    $container.html(resultHTML)
}

function renderPaginationElements(start, end, currentPageNumber) {
    resultHTML = ''
    for (var i = start; i <= end; i++) {
        resultHTML += renderPaginationElement(i, i == currentPageNumber)
    }
    return resultHTML
}

function renderPaginationElement(text, active) {
    return '<li class="page-item' + (active ? ' active' : '') +'"><a class="page-link" data-page-number=' + text + '>' + text + '</a></li>'
}