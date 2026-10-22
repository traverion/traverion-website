-- Partner Analytics conversion foundation: listing traffic events.
-- Privacy: no PII. session_key is an opaque client hash. Suppliers read aggregates for owned listings only.

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

-- Note: do not use date_trunc(timestamptz) in a unique index (not IMMUTABLE).
-- See 272_repair_listing_traffic_events.sql for the applied remote repair.

alter table public.listing_traffic_events enable row level security;

-- Anyone can insert anonymized traffic for published listing discovery (rate-limited by unique index).
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

-- Listing owners and team members can read events for their listings.
drop policy if exists listing_traffic_events_select_owner on public.listing_traffic_events;
create policy listing_traffic_events_select_owner
  on public.listing_traffic_events
  for select
  to authenticated
  using (public.is_listing_supplier_side(listing_id));

grant select, insert on public.listing_traffic_events to anon, authenticated;
