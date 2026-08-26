-- ============================================================
--  posinv_customers.name is declared `unique` in the CREATE TABLE
--  in 20_customers_vendors.sql, but that statement is
--  `create table if not exists` — since the table already existed
--  before that migration was written, the statement was a no-op
--  and the unique constraint was never actually applied. That's
--  why the Debts tab's upsert(..., { onConflict: "name" }) fails
--  with "no unique or exclusion constraint matching the ON
--  CONFLICT specification".
--
--  This adds the missing constraint directly, first collapsing
--  any duplicate names that may have accumulated in the meantime
--  (keeping the oldest row, merging phone/notes into it so
--  contact details aren't lost) so the constraint can be added.
--
--  Safe to re-run.
-- ============================================================

with keepers as (
  select min(id) as id, name
  from posinv_customers
  group by name
),
merged as (
  select k.id,
         (select c.phone from posinv_customers c
          where c.name = k.name and c.phone is not null
          order by c.id limit 1) as phone,
         (select c.notes from posinv_customers c
          where c.name = k.name and c.notes is not null
          order by c.id limit 1) as notes
  from keepers k
)
update posinv_customers pc
set phone = coalesce(pc.phone, m.phone),
    notes = coalesce(pc.notes, m.notes)
from merged m
where pc.id = m.id;

delete from posinv_customers dc
using (
  select min(id) as id, name
  from posinv_customers
  group by name
) k
where dc.name = k.name
  and dc.id <> k.id;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'posinv_customers'::regclass
      and contype = 'u'
  ) then
    alter table posinv_customers add constraint posinv_customers_name_key unique (name);
  end if;
end $$;
