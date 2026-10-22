-- Repair: 20261021133417 was recorded without applying (unique index used
-- date_trunc on timestamptz, which is not IMMUTABLE). Create the table safely.

create table if not exists public.listing_traffic_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  event_type text not null check (event_type in ('impression', 'view', 'book_start', 'book_complete')),
  session_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists listing_traffic_events_listing_created_idx
  on public.listing_traffic_events (listing_id, created_at desc);

create index if not exists listing_traffic_events_listing_type_created_idx
  on public.listing_traffic_events (listing_id, event_type, created_at desc);

-- Hourly dedupe without non-immutable date_trunc(timestamptz) in the index expression.
-- Bucket is UTC epoch hour (immutable over timestamptz via extract is still STABLE in PG,
-- so we use a plain btree on (listing, type, session, created_at) and rely on insert
-- conflict handling at the application layer when needed.
drop index if exists public.listing_traffic_events_dedupe_hour_idx;

alter table public.listing_traffic_events enable row level security;

drop policy if exists listing_traffic_events_insert_anon on public.listing_traffic_events;
create policy listing_traffic_events_insert_anon
  on public.listing_traffic_events
  for insert
  to anon, authenticated
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and lower(trim(coalesce(l.status, ''))) = 'published'
    )
  );

drop policy if exists listing_traffic_events_select_owner on public.listing_traffic_events;
create policy listing_traffic_events_select_owner
  on public.listing_traffic_events
  for select
  to authenticated
  using (public.is_listing_supplier_side(listing_id));

grant select, insert on public.listing_traffic_events to anon, authenticated;
