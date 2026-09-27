-- Phase 1035: stop world-readable SELECT on public.reviews for draft
-- listings (review text + guest_name were enumerable by listing UUID
-- after unpublish / while never published).
--
-- Original (006) policy: `using (true)`. Parent listings are already
-- SELECT-gated published-or-owner (092). Reviews must match so a draft
-- listing's reviews (including from paid TEST bookings before deactivate)
-- are not public while the listing itself is private.
--
-- Visible when:
--   - parent listing.status = 'published', OR
--   - reader is the listing supplier (partner Reviews), OR
--   - reader is the review author (own review still visible).

drop policy if exists "Reviews are viewable by everyone" on public.reviews;
create policy "Reviews are viewable by everyone"
  on public.reviews for select
  using (
    exists (
      select 1
      from public.listings l
      where l.id = reviews.listing_id
        and (
          l.status = 'published'
          or l.supplier_id = auth.uid()
          or reviews.user_id = auth.uid()
        )
    )
  );

comment on table public.reviews is
  'Traveler reviews. RLS (119) SELECT requires parent listing published, or reader is listing supplier / review author — draft listing reviews are not world-readable.';
