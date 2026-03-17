-- Cart: items per user before checkout (date + guests per listing)
-- Run after 007. When payment is added, cart items are converted to bookings.

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
