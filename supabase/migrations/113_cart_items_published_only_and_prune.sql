-- Phase 1023: harden dead-but-API-reachable public.cart_items the same
-- way wishlist was hardened in 104 + 112.
--
-- Matrix marks cart as DEAD/OBSOLETE (/cart → Trips). There are no
-- product UI callers of src/data/supabase-cart.ts today, but the table
-- + RLS still accept authenticated inserts that only check
-- auth.uid() = user_id. That lets any signed-in user plant cart rows
-- against draft/unpublished listings (same unpublished-inventory leak
-- class as wishlist before 104), and those rows survive partner
-- deactivate / staff force-unpublish.
--
-- Fix:
-- 1) One-shot delete cart rows whose listing is not published.
-- 2) INSERT and UPDATE WITH CHECK require listing status = published.
-- 3) AFTER UPDATE OF status on listings, prune cart_items for that
--    listing when status leaves published (mirrors wishlist trigger).

delete from public.cart_items c
using public.listings l
where c.listing_id = l.id
  and lower(trim(coalesce(l.status, ''))) is distinct from 'published';

drop policy if exists "Users can add to own cart" on public.cart_items;
create policy "Users can add to own cart"
  on public.cart_items for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.listings l
      where l.id = listing_id
        and lower(trim(coalesce(l.status, ''))) = 'published'
    )
  );

drop policy if exists "Users can update own cart items" on public.cart_items;
create policy "Users can update own cart items"
  on public.cart_items for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.listings l
      where l.id = listing_id
        and lower(trim(coalesce(l.status, ''))) = 'published'
    )
  );

create or replace function public.cart_items_prune_on_listing_unpublish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(trim(coalesce(NEW.status, ''))) is distinct from 'published' then
    delete from public.cart_items where listing_id = NEW.id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists cart_items_prune_on_listing_unpublish on public.listings;
create trigger cart_items_prune_on_listing_unpublish
  after update of status on public.listings
  for each row
  when (lower(trim(coalesce(NEW.status, ''))) is distinct from 'published')
  execute function public.cart_items_prune_on_listing_unpublish();

comment on function public.cart_items_prune_on_listing_unpublish() is
  'Removes cart_items when a listing leaves published (dead cart path still API-reachable).';

comment on table public.cart_items is
  'Legacy per-user cart (product UI routes /cart to Trips). RLS (113) requires published listings on insert/update; unpublish prunes rows.';
