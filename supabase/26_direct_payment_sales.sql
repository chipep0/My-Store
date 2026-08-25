-- ============================================================
--  Sales paid directly to a person/account instead of the till
--  ("Option 2" — replaces recording these as freeform Other
--  Income). Goods that leave the shop this way are now rung up
--  as a normal SALE order through the POS/cart flow, so stock
--  still deducts and it shows in Products sold like any other
--  sale — it's just tagged with WHO the payment actually went
--  to, instead of the till.
--
--  No new RLS policy needed: inserting/updating this column
--  rides on the existing write_orders / update_orders policies
--  (any cashier can ring a SALE; Refund/Void stays Manager-only).
--
--  Safe to re-run.
-- ============================================================

alter table posinv_orders add column if not exists paid_to text;
