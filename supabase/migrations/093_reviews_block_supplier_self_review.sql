-- Phase 586: close a supplier self-review / rating-manipulation gap that
-- migration 089 (fake-review / false-verified-badge fix) did not cover.
--
-- 089 closed the "arbitrary booking_id as fabricated verified proof" gap by
-- requiring booking_id, when set, to reference a real, confirmed booking
-- that actually belongs to the reviewing user AND is for the SAME listing
-- being reviewed. It never checked WHO that listing belongs to.
--
-- Traced create-booking-checkout-session/index.ts (the only real,
-- service-role booking-creation path -- confirmed by grepping every
-- `.from('bookings').insert(`/`claim_pending_checkout_booking` call site):
-- nothing anywhere in the checkout flow stops a signed-in supplier from
-- completing a real checkout on their OWN listing. So a supplier can
-- legitimately reach status='confirmed' (in production, a real Stripe
-- payment; here, TEST mode) on a booking of their own tour or stay, then
-- use that entirely real, entirely "legitimate" booking as proof to leave
-- themselves a five-star "Verified" review -- a straightforward rating-
-- manipulation / fake-social-proof vector that 089's ownership check does
-- not catch, since every one of 089's conditions (own booking, same
-- listing, confirmed status) is genuinely satisfied.
--
-- An unverified self-review (booking_id null) is blocked too, not only the
-- verified case -- the underlying fraud is a listing's own operator
-- impersonating an independent customer voice on their own listing at all,
-- which is misleading to travelers and to the marketplace's rating
-- integrity regardless of whether a "Verified" badge is attached.
--
-- This does NOT block a supplier from reviewing a DIFFERENT listing (their
-- own, as ordinary marketplace behavior, or a competitor's) that they
-- genuinely booked as a traveler -- only from reviewing a listing they
-- themselves supply. It also does not touch whether suppliers may book
-- their own listings at all (a separate, non-security product question
-- left untouched here) -- only whether doing so can be used to manufacture
-- a review.
--
-- Fix: extend both the INSERT and UPDATE policies' WITH CHECK (same
-- policies 089 already owns, same drop-and-recreate pattern) with an
-- independent guard: the review's listing must not belong to a listing
-- whose supplier_id is the reviewing user. Applied unconditionally
-- (verified or not), consistent with the reasoning above.
--
-- Verified against a scratch Postgres 16 instance (see supabase/tests/
-- reviews_supplier_self_review_guard.test.sql): the exploit (a supplier
-- reviewing their own listing using a real, owned, confirmed booking on it)
-- succeeds against 089 alone and is rejected after 093, an unverified
-- supplier self-review is also rejected, a genuine unrelated traveler's
-- verified review is unaffected, a supplier reviewing a DIFFERENT listing
-- they genuinely booked as a traveler is unaffected, and the same exploit
-- attempted via UPDATE (retroactively attaching a self-booking to an
-- existing row) is rejected.

drop policy if exists "Users can insert own review" on public.reviews;
create policy "Users can insert own review"
  on public.reviews for insert
  with check (
    auth.uid() = reviews.user_id
    and not exists (
      select 1
      from public.listings l
      where l.id = reviews.listing_id
        and l.supplier_id = reviews.user_id
    )
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
    and not exists (
      select 1
      from public.listings l
      where l.id = reviews.listing_id
        and l.supplier_id = reviews.user_id
    )
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
  'If set, review is "verified" (guest had a confirmed booking for this listing). RLS (089) requires ownership + listing match + confirmed status for any non-null value -- cannot be forged to another booking. RLS (093) additionally blocks a listing''s own supplier from reviewing it at all, verified or not.';
