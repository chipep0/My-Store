-- ============================================================
--  Other Income now nets directly into Total sales as a signed
--  amount — no more separate "Deducted from sales" line on the
--  report. An entry is NEGATIVE (subtracted from Total sales) by
--  default; toggling "This is genuine extra income" ON makes it
--  POSITIVE (added to Total sales) instead.
--
--  Replaces deduct_from_sales with is_positive. The rename+flip
--  preserves every existing entry's real-world effect: today
--  every row has deduct_from_sales = true (money sent out, so it
--  should stay negative), which becomes is_positive = false —
--  same behavior, new name. Guarded so it's safe to re-run
--  without double-flipping the data.
--
--  Run AFTER 24_other_income_deduct.sql. Safe to re-run.
-- ============================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'posinv_other_income' and column_name = 'deduct_from_sales'
  ) then
    alter table posinv_other_income rename column deduct_from_sales to is_positive;
    update posinv_other_income set is_positive = not is_positive;
  end if;
end $$;
