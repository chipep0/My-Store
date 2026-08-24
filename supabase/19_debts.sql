-- ============================================================
--  Debts (accounts receivable) — a sale can now go out with a
--  balance still owed, tracked on posinv_orders.balance_due,
--  with a running payment ledger in posinv_order_payments so
--  partial/installment payments are recorded over time.
--
--  Any cashier can ring a credit sale or record a payment (same
--  as ringing a normal sale) — only Refund/Void stays Manager-only,
--  which is why update_orders is replaced with a column-aware
--  version rather than staying fully Manager-gated.
--
--  Run AFTER 16_role_permissions.sql. Safe to re-run.
-- ============================================================

alter table posinv_orders add column if not exists balance_due numeric(10,2) not null default 0;

create table if not exists posinv_order_payments (
  id         bigint generated always as identity primary key,
  order_id   bigint not null references posinv_orders(id) on delete cascade,
  paid_on    date not null default current_date,
  amount     numeric(10,2) not null check (amount > 0),
  note       text,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);
alter table posinv_order_payments enable row level security;

drop policy if exists read_order_payments on posinv_order_payments;
create policy read_order_payments on posinv_order_payments for select using (true);
-- Recording a payment is routine cashier work, same trust level as ringing a sale.
drop policy if exists write_order_payments on posinv_order_payments;
create policy write_order_payments on posinv_order_payments for insert to authenticated with check (true);
-- Deleting a mis-entered payment is a correction, same tier as refund/void.
drop policy if exists delete_order_payments on posinv_order_payments;
create policy delete_order_payments on posinv_order_payments for delete to authenticated using (posinv_is_manager());

-- Replace the Manager-only update_orders policy with a column-aware one:
-- anyone can update an order (e.g. balance_due / status when recording a
-- payment), but flipping status to Refund or Void still needs a Manager.
drop policy if exists update_orders on posinv_orders;
create policy update_orders on posinv_orders
  for update to authenticated
  using (true)
  with check (status not in ('Refund','Void') or posinv_is_manager());
