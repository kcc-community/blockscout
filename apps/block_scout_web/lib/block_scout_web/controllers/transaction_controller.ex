defmodule BlockScoutWeb.TransactionController do
  use BlockScoutWeb, :controller

  import BlockScoutWeb.Chain, only: [fetch_page_number: 1, paging_options: 1, next_page_params: 3, update_page_number: 2, split_list_by_page: 1]

  alias BlockScoutWeb.{AccessHelpers, Controller, TransactionView}
  alias Explorer.Chain
  alias Phoenix.View

  {:ok, burn_address_hash} = Chain.string_to_address_hash("0x0000000000000000000000000000000000000000")
  @burn_address_hash burn_address_hash

  @default_options  [
                      necessity_by_association: %{
                        :block => :required,
                        [created_contract_address: :names] => :optional,
                        [from_address: :names] => :optional,
                        [to_address: :names] => :optional
                      }
                    ]

  def index(conn, %{"type" => "JSON"} = params) do
    options =
    @default_options 
    |> Keyword.merge(paging_options(params))
    
    full_options = 
      options
      |> Keyword.put(:paging_options, 
        params
        |> fetch_page_number()
        |> update_page_number(Keyword.get(options, :paging_options))) 

    transactions_plus_one = Chain.recent_collated_transactions_for_rap(full_options)
    {transactions, next_page} = split_list_by_page(transactions_plus_one)

    page_size = Enum.count(transactions)
    pages_limit = 
      if page_size != 0 do 
        (Chain.limit_shownig_transactions() / page_size) |> Float.ceil() |> trunc()
      else 
        -1
      end
    
    next_page_params =
      case next_page_params(next_page, transactions, params) do
        nil ->
          nil

        next_page_params ->
          next_page_params
          |> Map.delete("type")
          |> Map.put("pages_limit", pages_limit)
          |> Map.put("page_size", page_size)
      end

    json(
      conn,
      %{
        items:
          Enum.map(transactions, fn transaction ->
            View.render_to_string(
              TransactionView,
              "_tile.html",
              transaction: transaction,
              burn_address_hash: @burn_address_hash,
              conn: conn
            )
          end),
        next_page_params: next_page_params
      }
    )
  end

  def index(conn, _params) do
    transaction_estimated_count = Chain.transaction_estimated_count()

    render(
      conn,
      "index.html",
      current_path: Controller.current_full_path(conn),
      transaction_estimated_count: transaction_estimated_count
    )
  end

  def show(conn, %{"id" => id}) do
    with {:ok, transaction_hash} <- Chain.string_to_transaction_hash(id),
         :ok <- Chain.check_transaction_exists(transaction_hash) do
      if Chain.transaction_has_token_transfers?(transaction_hash) do
        redirect(conn, to: AccessHelpers.get_path(conn, :transaction_token_transfer_path, :index, id))
      else
        redirect(conn, to: AccessHelpers.get_path(conn, :transaction_internal_transaction_path, :index, id))
      end
    else
      :error ->
        set_invalid_view(conn, id)

      :not_found ->
        set_not_found_view(conn, id)
    end
  end

  def set_not_found_view(conn, transaction_hash_string) do
    conn
    |> put_status(404)
    |> put_view(TransactionView)
    |> render("not_found.html", transaction_hash: transaction_hash_string)
  end

  def set_invalid_view(conn, transaction_hash_string) do
    conn
    |> put_status(422)
    |> put_view(TransactionView)
    |> render("invalid.html", transaction_hash: transaction_hash_string)
  end
end
