-- Phase 1021: prune wishlist rows when a listing leaves published.
--
-- Migration 104 blocked NEW wishlist inserts for non-published listings and
-- one-shot deleted existing non-published saves. It did not keep the table
-- honest after a later unpublish (partner Deactivate or staff
-- admin_force_unpublish_listing): the wishlist row remains, heart toggles
-- still report "saved", and AccountPage saved-count includes unpublished
-- inventory. WishlistPage already hides non-visible listings in the UI, but
-- the persisted row + count remain wrong until the traveler manually clears
-- them.
--
-- Fix: AFTER UPDATE OF status on public.listings, delete wishlist rows for
-- that listing whenever the new status is not published. Also re-run the
-- one-shot cleanup so any rows already orphaned by unpublish (post-104)
-- are removed now.

create or replace function public.wishlist_prune_on_listing_unpublish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(trim(coalesce(NEW.status, ''))) is distinct from 'published' then
    delete from public.wishlist where listing_id = NEW.id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists wishlist_prune_on_listing_unpublish on public.listings;
create trigger wishlist_prune_on_listing_unpublish
  after update of status on public.listings
  for each row
  when (lower(trim(coalesce(NEW.status, ''))) is distinct from 'published')
  execute function public.wishlist_prune_on_listing_unpublish();

comment on function public.wishlist_prune_on_listing_unpublish() is
  'Removes traveler wishlist rows when a listing leaves published (partner deactivate or staff force-unpublish).';

delete from public.wishlist w
using public.listings l
where w.listing_id = l.id
  and lower(trim(coalesce(l.status, ''))) is distinct from 'published';
