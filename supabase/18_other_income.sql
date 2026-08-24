-- ============================================================
--  Other Income — revenue that came in but never touched the
--  till (e.g. a customer paid directly into the bank, or sent
--  money straight to a specific person/account instead of
--  handing over cash). Tracked separately from both POS sales
--  AND Expenses, so it:
--    - counts as real revenue (Total revenue = sales + this)
--    - never gets confused with a cost (Expenses stays untouched)
--    - never inflates "Total sales", which stays the till/cash
--      figure you reconcile against actual cash at hand
--  Run AFTER 16_role_permissions.sql (needs posinv_is_manager()).
--  Safe to re-run.
-- ============================================================
create table if not exists posinv_other_income (
  id          bigint generated always as identity primary key,
  received_on date not null default current_date,
  category    text not null default 'Bank Transfer',
  recipient   text,                 -- who/what account the money went to
  description text,
  amount      numeric(10,2) not null check (amount >= 0),
  created_by  uuid references auth.users,
  created_at  timestamptz not null default now()
);
alter table posinv_other_income enable row level security;

drop policy if exists read_other_income on posinv_other_income;
create policy read_other_income on posinv_other_income for select using (true);
drop policy if exists write_other_income on posinv_other_income;
create policy write_other_income on posinv_other_income for insert to authenticated with check (posinv_is_manager());
drop policy if exists delete_other_income on posinv_other_income;
create policy delete_other_income on posinv_other_income for delete to authenticated using (posinv_is_manager());
