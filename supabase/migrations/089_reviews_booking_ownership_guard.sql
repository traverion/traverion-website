-- Close a fake-review / false-"verified"-badge gap in the reviews table.
--
-- The original (006) insert/update RLS on public.reviews only ever checked
-- `auth.uid() = user_id`. It never checked that a supplied booking_id
-- actually belongs to the reviewing user, is for the same listing being
-- reviewed, or reflects an accepted (status = 'confirmed') booking at all.
-- The app's own eligibility check (userHasCompletedBookingForListing in
-- src/data/supabase-reviews.ts) is a client-side UI convenience only --
-- submitReview() itself passes whatever booking_id it is given straight
-- into an upsert with no further validation, and nothing stops a caller
-- from hand-crafting a request directly against the public Supabase client.
--
-- Concretely, before this migration, any authenticated user could:
--   - Post a review (including on a listing they have never booked, e.g.
--     a competitor's listing, or their own listing under a second
--     account) with an arbitrary rating/comment/guest_name.
--   - Set booking_id to ANY existing booking id anywhere in the system --
--     not even their own -- and have it displayed with a "Verified"
--     badge, since fetchReviewsByListingId/fetchReviewsForSupplierListings
--     both compute `verified: !!r.booking_id` with no ownership check at
--     read time either. Verified badges are purely a display artifact of
--     "is booking_id non-null", so this was a straightforward path to a
--     fraudulent verified-purchase claim.
--
-- Fix: require that a non-null booking_id, at insert or update time,
-- reference a real booking that (a) belongs to the reviewing user (by
-- guest_user_id or guest_email, mirroring the exact dual-identity
-- ownership pattern already used for consumer booking RLS since migration
-- 037), (b) is for the SAME listing being reviewed, and (c) has reached
-- status = 'confirmed' -- the same bar the app's own client-side
-- eligibility check already uses. An unverified review (booking_id null)
-- remains allowed, unchanged.
--
-- This does not touch review display/read (select remains public, as
-- before) or the one-review-per-user-per-listing unique index.

-- NOTE: every outer (NEW-row) column reference below is explicitly
-- qualified as reviews.<column>, even where it looks unambiguous today.
-- An earlier draft of this policy left listing_id unqualified inside the
-- EXISTS subquery; since public.bookings also has a listing_id column,
-- Postgres silently bound it to the subquery's own b.listing_id (a
-- self-referential, always-true comparison) instead of the row being
-- inserted -- caught by this migration's own regression test (Case 5:
-- a booking for a different listing was wrongly accepted). Qualifying
-- every outer reference removes the ambiguity outright rather than
-- relying on today's column names happening not to collide.
drop policy if exists "Users can insert own review" on public.reviews;
create policy "Users can insert own review"
  on public.reviews for insert
  with check (
    auth.uid() = reviews.user_id
    and (
      reviews.booking_id is null
      or exists (
        select 1
        from public.bookings b
        where b.id = reviews.booking_id
          and b.listing_id = reviews.listing_id
          and b.status = 'confirmed'
          and (
            b.guest_user_id = auth.uid()
            or (
              length(trim(coalesce(auth.jwt() ->> 'email', ''))) > 0
              and lower(trim(coalesce(b.guest_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
            )
          )
      )
    )
  );

drop policy if exists "Users can update own review" on public.reviews;
create policy "Users can update own review"
  on public.reviews for update
  using (auth.uid() = reviews.user_id)
  with check (
    auth.uid() = reviews.user_id
    and (
      reviews.booking_id is null
      or exists (
        select 1
        from public.bookings b
        where b.id = reviews.booking_id
          and b.listing_id = reviews.listing_id
          and b.status = 'confirmed'
          and (
            b.guest_user_id = auth.uid()
            or (
              length(trim(coalesce(auth.jwt() ->> 'email', ''))) > 0
              and lower(trim(coalesce(b.guest_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
            )
          )
      )
    )
  );

comment on column public.reviews.booking_id is
  'If set, review is "verified" (guest had a confirmed booking for this listing). RLS (089) requires ownership + listing match + confirmed status for any non-null value -- cannot be forged to another booking.';
