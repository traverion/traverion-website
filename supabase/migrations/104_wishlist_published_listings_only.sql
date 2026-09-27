-- Wishlist may only reference published listings.
-- Draft/archived saves leak unpublished inventory into traveler Saved.

delete from public.wishlist w
using public.listings l
where w.listing_id = l.id
  and lower(trim(coalesce(l.status, ''))) is distinct from 'published';

drop policy if exists "Users can add to own wishlist" on public.wishlist;
create policy "Users can add to own wishlist"
  on public.wishlist for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.listings l
      where l.id = listing_id
        and lower(trim(coalesce(l.status, ''))) = 'published'
    )
  );

comment on policy "Users can add to own wishlist" on public.wishlist is
  'Travelers may only save published listings — drafts stay private.';
