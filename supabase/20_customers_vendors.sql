-- ============================================================
--  Customers & vendors — named parties for sales/purchases and,
--  now, for tracking who owes a debt. These tables were never
--  captured in a migration before (the app only ever SELECTed
--  from them), so this creates them if missing and makes sure
--  any signed-in cashier can add a new one — same trust level
--  as ringing up a sale, matching 19_debts.sql.
--
--  Safe to re-run.
-- ============================================================

create table if not exists posinv_customers (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);
alter table posinv_customers enable row level security;

create table if not exists posinv_vendors (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);
alter table posinv_vendors enable row level security;

drop policy if exists read_customers on posinv_customers;
create policy read_customers on posinv_customers for select using (true);
drop policy if exists write_customers on posinv_customers;
create policy write_customers on posinv_customers for insert to authenticated with check (true);

drop policy if exists read_vendors on posinv_vendors;
create policy read_vendors on posinv_vendors for select using (true);
drop policy if exists write_vendors on posinv_vendors;
create policy write_vendors on posinv_vendors for insert to authenticated with check (true);
