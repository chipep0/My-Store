-- ============================================================
--  Per-entry toggle on Other Income: "Deduct from total sales."
--
--  Other Income never touched Total Sales before (it only added
--  to Net profit). Some entries represent money that WAS already
--  rung up as a POS sale but actually left/never reached the
--  till (paid straight to an account/person), so counting it in
--  Total Sales overstates that day's real till figure. Flagging
--  an entry subtracts it from Total Sales (and so from Cash at
--  hand too, since that derives from Total Sales) while Net
--  profit is unaffected — it already adds the full Other Income
--  total back in, so the subtract-then-add-back nets to zero.
--
--  Run AFTER 18_other_income.sql. Safe to re-run.
-- ============================================================

alter table posinv_other_income add column if not exists deduct_from_sales boolean not null default false;
