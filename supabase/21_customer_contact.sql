-- ============================================================
--  Customer contact details (phone / notes) — editable from the
--  Debts tab so a credit sale can be tied to a real phone number,
--  not just a name.
--
--  Run AFTER 20_customers_vendors.sql. Safe to re-run.
-- ============================================================

alter table posinv_customers add column if not exists phone text;
alter table posinv_customers add column if not exists notes text;

-- Editing contact details is an update, not just an insert — same
-- cashier-level trust as adding a new customer in the first place.
drop policy if exists update_customers on posinv_customers;
create policy update_customers on posinv_customers for update to authenticated using (true) with check (true);
