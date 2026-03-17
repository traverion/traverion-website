-- Customer reviews for listings (post-experience; supports verified badge via booking_id)
-- Run after 005

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

-- Anyone can read reviews
create policy "Reviews are viewable by everyone"
  on public.reviews for select
  using (true);

-- Authenticated users can insert their own review (one per listing per user enforced in app or unique constraint)
create policy "Users can insert own review"
  on public.reviews for insert
  with check (auth.uid() = user_id);

-- Users can update/delete only their own review
create policy "Users can update own review"
  on public.reviews for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own review"
  on public.reviews for delete
  using (auth.uid() = user_id);

-- Optional: one review per user per listing (allow only one per user per listing)
create unique index if not exists reviews_listing_user_unique on public.reviews(listing_id, user_id);
