-- Unique version of the listings SELECT policy (043 was already used by listing_images_bucket).
-- Idempotent.

drop policy if exists "Listings are viewable by everyone" on public.listings;
drop policy if exists "Listings readable when published or owner" on public.listings;

create policy "Listings readable when published or owner"
  on public.listings for select
  using (
    status is null
    or status = 'published'
    or auth.uid() = supplier_id
  );
