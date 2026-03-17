-- =============================================================================
-- Traverion: migrations 006–011 in one file (pre-payment backend)
-- Run after 001–005. Execute in Supabase SQL Editor as one script.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 006: Reviews
-- -----------------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  guest_name text not null,
  rating int not null check (rating >= 1 and rating <= 5),
  title text,
  comment text not null default '',
  images jsonb default '[]'::jsonb,
  created_at timestamptz default now() not null
);

comment on column public.reviews.booking_id is 'If set, review is "verified" (guest had a completed booking for this listing)';
comment on column public.reviews.guest_name is 'Display name at time of review';

create index if not exists reviews_listing_id on public.reviews(listing_id);
create index if not exists reviews_user_id on public.reviews(user_id);
create index if not exists reviews_created_at on public.reviews(created_at desc);

alter table public.reviews enable row level security;

create policy "Reviews are viewable by everyone"
  on public.reviews for select
  using (true);

create policy "Users can insert own review"
  on public.reviews for insert
  with check (auth.uid() = user_id);

create policy "Users can update own review"
  on public.reviews for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own review"
  on public.reviews for delete
  using (auth.uid() = user_id);

create unique index if not exists reviews_listing_user_unique on public.reviews(listing_id, user_id);

-- -----------------------------------------------------------------------------
-- 007: Wishlist
-- -----------------------------------------------------------------------------
create table if not exists public.wishlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz default now() not null,
  primary key (user_id, listing_id)
);

create index if not exists wishlist_user_id on public.wishlist(user_id);
create index if not exists wishlist_listing_id on public.wishlist(listing_id);

alter table public.wishlist enable row level security;

create policy "Users can view own wishlist"
  on public.wishlist for select
  using (auth.uid() = user_id);

create policy "Users can add to own wishlist"
  on public.wishlist for insert
  with check (auth.uid() = user_id);

create policy "Users can remove from own wishlist"
  on public.wishlist for delete
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 008: Cart items
-- -----------------------------------------------------------------------------
create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  booking_date date not null,
  guests int not null default 1 check (guests >= 1),
  created_at timestamptz default now() not null
);

create index if not exists cart_items_user_id on public.cart_items(user_id);
create index if not exists cart_items_listing_id on public.cart_items(listing_id);

alter table public.cart_items enable row level security;

create policy "Users can view own cart"
  on public.cart_items for select
  using (auth.uid() = user_id);

create policy "Users can add to own cart"
  on public.cart_items for insert
  with check (auth.uid() = user_id);

create policy "Users can update own cart items"
  on public.cart_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own cart items"
  on public.cart_items for delete
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 009: Listing availability + cancellation policy
-- -----------------------------------------------------------------------------
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

create policy "Listing availability is viewable by everyone"
  on public.listing_availability for select
  using (true);

create policy "Suppliers can manage availability for own listings"
  on public.listing_availability for insert
  with check (
    exists (
      select 1 from public.listings
      where listings.id = listing_availability.listing_id
      and listings.supplier_id = auth.uid()
    )
  );

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

alter table public.listings
  add column if not exists cancellation_policy text;

comment on column public.listings.cancellation_policy is 'E.g. "Free cancellation up to 24 hours before" or "Non-refundable"';

-- -----------------------------------------------------------------------------
-- 010: Supplier payout method
-- -----------------------------------------------------------------------------
alter table public.supplier_profiles
  add column if not exists payout_method text check (payout_method in ('bank', 'paypal', 'none') or payout_method is null),
  add column if not exists payout_iban text,
  add column if not exists payout_bic text,
  add column if not exists payout_paypal_email text;

comment on column public.supplier_profiles.payout_method is 'bank | paypal | none – used when payouts are implemented';
comment on column public.supplier_profiles.payout_iban is 'IBAN for bank payouts';
comment on column public.supplier_profiles.payout_bic is 'BIC/SWIFT for bank payouts';
comment on column public.supplier_profiles.payout_paypal_email is 'PayPal email for payouts';

-- -----------------------------------------------------------------------------
-- 011: Booking amount placeholder
-- -----------------------------------------------------------------------------
alter table public.bookings
  add column if not exists total_amount numeric,
  add column if not exists currency text default 'USD';

comment on column public.bookings.total_amount is 'Total charged or to be paid; set when payment is integrated';
comment on column public.bookings.currency is 'Currency for total_amount';
