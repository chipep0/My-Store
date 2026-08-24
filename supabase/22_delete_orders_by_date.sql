-- ============================================================
--  Permanently deleting orders (sales & purchases) for a given
--  date — for wiping bad/test data, distinct from Refund/Void
--  which intentionally keeps a record. posinv_orders never had a
--  delete policy at all, so this was previously blocked outright.
--
--  order_items and order_payments cascade-delete via their FK
--  (ON DELETE CASCADE), and FK-triggered cascades bypass RLS on
--  the child table by design, so no extra policy is needed there.
--
--  Manager-only — same tier as "Delete ALL products".
--  Safe to re-run.
-- ============================================================

drop policy if exists delete_orders on posinv_orders;
create policy delete_orders on posinv_orders
  for delete to authenticated using (posinv_is_manager());
