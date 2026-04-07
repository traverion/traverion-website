-- Anonymous and logged-in travelers: only published listings (null status = legacy published).
-- Partner session (auth.uid() = supplier_id): can still read own drafts in the portal.
drop policy if exists "Listings are viewable by everyone" on public.listings;

create policy "Listings readable when published or owner"
  on public.listings for select
  using (
    status is null
    or status = 'published'
    or auth.uid() = supplier_id
  );
