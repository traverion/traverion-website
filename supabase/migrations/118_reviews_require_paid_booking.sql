-- Phase 1030: align review booking eligibility with payment truth.
--
-- Migration 117 requires a non-null owned confirmed booking. Product UI
-- (bookingEligibleForReview) additionally requires payment_status in
-- (paid, complete, succeeded). Without that check, a traveler with a
-- confirmed-but-unpaid row (or a row whose payment never cleared) could
-- still plant a "verified" review via PostgREST after 117.
--
-- Fix: extend the EXISTS booking predicate on INSERT/UPDATE to also
-- require paid/complete/succeeded payment_status. After-start timing stays
-- client-gated (timezone-sensitive; SQL follow-up later if needed).

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
        and lower(trim(coalesce(b.payment_status, ''))) in ('paid', 'complete', 'succeeded')
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
        and lower(trim(coalesce(b.payment_status, ''))) in ('paid', 'complete', 'succeeded')
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
  'Required verified booking link. RLS (118) requires non-null booking owned by the reviewer, same listing, confirmed + paid/complete/succeeded, and not a self-supplier review.';
