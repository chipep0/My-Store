-- ============================================================
--  Offline sales queue — a sale rung up while offline is stored
--  locally on the device and synced once the connection returns.
--  This column is the idempotency key: before inserting a queued
--  sale, the app checks whether an order with this client_uuid
--  already exists, so a sync that's retried after a partial
--  failure (e.g. the app closed mid-request) can never create a
--  duplicate order.
--
--  Safe to re-run.
-- ============================================================

alter table posinv_orders add column if not exists client_uuid text unique;
