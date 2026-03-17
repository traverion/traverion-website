-- Wishlist: saved listings per user (consumer)
-- Run after 006

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
