-- ============================================================
--  Lets a Manager manually re-lock an already-archived period's
--  snapshot from the app (Reports → Archived periods → Refresh).
--
--  Archived weeks/months/quarters are intentionally frozen at
--  close time (see 12_period_archive.sql) — if you edit or delete
--  an expense/sale dated inside an already-closed period, the
--  archived totals do NOT change on their own. This just exposes
--  the existing posinv_archive_period() function over the API so
--  a Manager can explicitly recompute one period on demand,
--  instead of needing SQL Editor access.
--
--  Run AFTER 12_period_archive.sql (and 13_expenses.sql, since
--  that's what defines the total_expenses/net_profit columns
--  posinv_archive_period() also writes). Safe to re-run.
-- ============================================================

grant execute on function posinv_archive_period(text, date, date) to authenticated;
