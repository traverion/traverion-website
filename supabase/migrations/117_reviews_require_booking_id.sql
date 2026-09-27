-- Phase 1029: require a real eligible booking for every review insert/update.
--
-- Migrations 089/093 still allowed booking_id IS NULL ("unverified" reviews).
-- Product UI (TourDetails/StayDetails + userHasCompletedBookingForListing)
-- only offers the review form after a completed booking and always submits
-- a bookingId. The null path remained an API-only spam vector: any
-- authenticated non-supplier user could plant unverified reviews on any
-- listing without ever booking.
--
-- Fix: drop the null branch. INSERT/UPDATE WITH CHECK requires a
-- booking_id that exists, matches listing_id, status=confirmed, belongs to
-- the reviewer (guest_user_id or JWT email), and is not the listing's own
-- supplier (093 self-review block retained).
--
-- Note: after-start / payment_status timing remains client-gated via
-- bookingEligibleForReview; RLS mirrors ownership + confirmed + not
-- self-supplier. Tightening paid+after-start into SQL is a follow-up if
-- needed — this phase closes the null-booking spam hole first.

drop policy if exists "Users can insert own review" on public.reviews;
create policy "Users can insert own review"
  on public.reviews for insert
  with check (
    auth.uid() = reviews.user_id
    and reviews.booking_id is not null
    and not exists (
      select 1
      from public.listings l
      where l.id = reviews.listing_id
        and l.supplier_id = reviews.user_id
    )
    and exists (
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
  );

drop policy if exists "Users can update own review" on public.reviews;
create policy "Users can update own review"
  on public.reviews for update
  using (auth.uid() = reviews.user_id)
  with check (
    auth.uid() = reviews.user_id
    and reviews.booking_id is not null
    and not exists (
      select 1
      from public.listings l
      where l.id = reviews.listing_id
        and l.supplier_id = reviews.user_id
    )
    and exists (
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
  );

comment on column public.reviews.booking_id is
  'Required verified booking link. RLS (117) requires non-null booking_id owned by the reviewer, same listing, confirmed status, and not a self-supplier review.';
