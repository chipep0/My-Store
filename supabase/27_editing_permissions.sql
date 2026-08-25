-- ============================================================
--  Editing support — Expenses, Other Income, and the customer/
--  vendor directory could previously only be added or deleted,
--  never corrected in place. This adds the RLS policies that
--  were simply never created, at the same Manager-only trust
--  tier as each table's existing insert/delete policies.
--
--  Run AFTER 18_other_income.sql and 21_customer_contact.sql.
--  Safe to re-run.
-- ============================================================

drop policy if exists update_expenses on posinv_expenses;
create policy update_expenses on posinv_expenses
  for update to authenticated using (posinv_is_manager()) with check (posinv_is_manager());

drop policy if exists update_other_income on posinv_other_income;
create policy update_other_income on posinv_other_income
  for update to authenticated using (posinv_is_manager()) with check (posinv_is_manager());

drop policy if exists delete_customers on posinv_customers;
create policy delete_customers on posinv_customers
  for delete to authenticated using (posinv_is_manager());

drop policy if exists delete_vendors on posinv_vendors;
create policy delete_vendors on posinv_vendors
  for delete to authenticated using (posinv_is_manager());
