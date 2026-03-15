-- Listing status (draft/published) and booking guest name
-- Run after 002_discounts_and_earnings.sql

-- Listings: add status, default published for existing rows
alter table public.listings
  add column if not exists status text default 'published' check (status in ('draft', 'published'));

comment on column public.listings.status is 'draft = not visible on main site; published = visible';

-- Bookings: add guest_name for display in supplier dashboard
alter table public.bookings
  add column if not exists guest_name text;

comment on column public.bookings.guest_name is 'Customer name from booking form';

-- Suppliers can update status of bookings for their own listings
create policy "Suppliers can update booking status for their listings"
  on public.bookings for update
  using (
    exists (
      select 1 from public.listings
      where listings.id = bookings.listing_id
      and listings.supplier_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.listings
      where listings.id = bookings.listing_id
      and listings.supplier_id = auth.uid()
    )
  );
