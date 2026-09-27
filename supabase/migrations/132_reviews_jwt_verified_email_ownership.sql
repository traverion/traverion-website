-- Phase 1114: Restore jwt_verified_email() on review INSERT/UPDATE RLS.
--
-- Migration 098 required a verified email claim so an unverified signup matching
-- a guest-checkout booking email could not forge a verified review.
-- Migrations 117→118→123 rewrote the policies with raw auth.jwt()->>'email',
-- reopening that forgery path while keeping paid/started/booking_id rules.
--
-- Keep 123 semantics (booking required, paid+confirmed, experience started,
-- no supplier self-review) but match ownership via jwt_verified_email().

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
      join public.listings l on l.id = b.listing_id
      where b.id = reviews.booking_id
        and b.listing_id = reviews.listing_id
        and b.status = 'confirmed'
        and lower(trim(coalesce(b.payment_status, ''))) in ('paid', 'complete', 'succeeded')
        and (
          b.guest_user_id = auth.uid()
          or (
            length(trim(coalesce(public.jwt_verified_email(), ''))) > 0
            and lower(trim(coalesce(b.guest_email, ''))) = public.jwt_verified_email()
          )
        )
        and public.booking_experience_started_for_review(b, l)
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
      join public.listings l on l.id = b.listing_id
      where b.id = reviews.booking_id
        and b.listing_id = reviews.listing_id
        and b.status = 'confirmed'
        and lower(trim(coalesce(b.payment_status, ''))) in ('paid', 'complete', 'succeeded')
        and (
          b.guest_user_id = auth.uid()
          or (
            length(trim(coalesce(public.jwt_verified_email(), ''))) > 0
            and lower(trim(coalesce(b.guest_email, ''))) = public.jwt_verified_email()
          )
        )
        and public.booking_experience_started_for_review(b, l)
    )
  );

comment on column public.reviews.booking_id is
  'Required verified booking link. RLS requires owned paid+confirmed booking whose experience has started, jwt_verified_email for guest-email ownership (Phase 1114), and not a self-supplier review.';
