-- Phase 1043: require the linked booking's experience to have started
-- before a review can be written (align closer to bookingEligibleForReview).
--
-- Migrations 117/118 already require owned paid+confirmed booking_id.
-- UI also waits until tour start / stay checkout. Without SQL, PostgREST
-- could plant a verified review immediately after payment.
--
-- Rule (listing TZ when present else Europe/Helsinki):
--   Stay (check_out present): local calendar date >= check_out
--   Tour: local wall clock > booking_date + start_time (default 23:59)
--
-- Timezone: purchase_snapshot.departureTimezone, else
-- listing_extras.departureTimezone, else Europe/Helsinki.

create or replace function public.booking_experience_started_for_review(
  b public.bookings,
  l public.listings
)
returns boolean
language plpgsql
stable
as $$
declare
  tz text;
  local_now timestamp;
  start_local timestamp;
  st text;
  hh int;
  mm int;
begin
  tz := nullif(trim(coalesce(b.purchase_snapshot->>'departureTimezone', '')), '');
  if tz is null then
    tz := nullif(trim(coalesce(l.listing_extras->>'departureTimezone', '')), '');
  end if;
  if tz is null or tz = '' then
    tz := 'Europe/Helsinki';
  end if;

  begin
    local_now := timezone(tz, now());
  exception when others then
    local_now := timezone('Europe/Helsinki', now());
    tz := 'Europe/Helsinki';
  end;

  if b.check_out is not null then
    return (local_now::date >= b.check_out::date);
  end if;

  if b.booking_date is null then
    return false;
  end if;

  st := coalesce(nullif(trim(coalesce(b.start_time::text, '')), ''), '23:59:00');
  begin
    hh := split_part(st, ':', 1)::int;
    mm := split_part(st, ':', 2)::int;
  exception when others then
    hh := 23;
    mm := 59;
  end;

  start_local := b.booking_date::timestamp + make_interval(hours => hh, mins => mm);
  return local_now > start_local;
end;
$$;

comment on function public.booking_experience_started_for_review(public.bookings, public.listings) is
  'True when the booking experience has started/ended for review eligibility (Phase 1043). Stay: local date >= check_out. Tour: local now > booking_date+start_time (default 23:59). TZ from snapshot/listing extras or Europe/Helsinki.';

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
            length(trim(coalesce(auth.jwt() ->> 'email', ''))) > 0
            and lower(trim(coalesce(b.guest_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
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
            length(trim(coalesce(auth.jwt() ->> 'email', ''))) > 0
            and lower(trim(coalesce(b.guest_email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
          )
        )
        and public.booking_experience_started_for_review(b, l)
    )
  );

comment on column public.reviews.booking_id is
  'Required verified booking link. RLS (123) requires owned paid+confirmed booking whose experience has started (1043), and not a self-supplier review.';
