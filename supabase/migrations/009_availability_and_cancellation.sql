-- Listing availability (per date, capacity) and cancellation policy on listings
-- Run after 008

-- Availability: supplier sets capacity per date; app increments booked on confirm
create table if not exists public.listing_availability (
  listing_id uuid not null references public.listings(id) on delete cascade,
  available_date date not null,
  capacity int not null check (capacity >= 0),
  booked int not null default 0 check (booked >= 0),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  primary key (listing_id, available_date),
  constraint booked_lte_capacity check (booked <= capacity)
);

comment on column public.listing_availability.booked is 'Incremented when a booking is confirmed; decremented on cancel';

create index if not exists listing_availability_listing_date on public.listing_availability(listing_id, available_date);

alter table public.listing_availability enable row level security;

drop policy if exists "Listing availability is viewable by everyone" on public.listing_availability;
create policy "Listing availability is viewable by everyone"
  on public.listing_availability for select
  using (true);

drop policy if exists "Suppliers can manage availability for own listings" on public.listing_availability;
create policy "Suppliers can manage availability for own listings"
  on public.listing_availability for insert
  with check (
    exists (
      select 1 from public.listings
      where listings.id = listing_availability.listing_id
      and listings.supplier_id = auth.uid()
    )
  );

drop policy if exists "Suppliers can update availability for own listings" on public.listing_availability;
create policy "Suppliers can update availability for own listings"
  on public.listing_availability for update
  using (
    exists (
      select 1 from public.listings
      where listings.id = listing_availability.listing_id
      and listings.supplier_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.listings
      where listings.id = listing_availability.listing_id
      and listings.supplier_id = auth.uid()
    )
  );

drop policy if exists "Suppliers can delete availability for own listings" on public.listing_availability;
create policy "Suppliers can delete availability for own listings"
  on public.listing_availability for delete
  using (
    exists (
      select 1 from public.listings
      where listings.id = listing_availability.listing_id
      and listings.supplier_id = auth.uid()
    )
  );

drop trigger if exists listing_availability_updated_at on public.listing_availability;
create trigger listing_availability_updated_at
  before update on public.listing_availability
  for each row execute function public.set_updated_at();

-- Listings: cancellation policy (display and future refund logic)
alter table public.listings
  add column if not exists cancellation_policy text;

comment on column public.listings.cancellation_policy is 'E.g. "Free cancellation up to 24 hours before" or "Non-refundable"';
