-- Phase 1732: Traveler review write after listing force-unpublish.
--
-- BEFORE: reviews INSERT/UPDATE WITH CHECK joined listings under invoker RLS.
-- Travelers cannot SELECT draft listings (migration 141), so paid guests who
-- received review_request and saw Leave a review (Phase 1731) still failed to
-- upsert — empty join → policy deny.
--
-- AFTER: SECURITY DEFINER traveler_may_write_review reads booking+listing
-- with elevated rights, preserves paid/ownership/experience/self-supplier gates.

create or replace function public.traveler_may_write_review(
  p_listing_id uuid,
  p_booking_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  l public.listings%rowtype;
begin
  if auth.uid() is null or p_user_id is null or auth.uid() <> p_user_id then
    return false;
  end if;
  if p_listing_id is null or p_booking_id is null then
    return false;
  end if;

  select * into b from public.bookings where id = p_booking_id;
  if not found then
    return false;
  end if;
  if b.listing_id is distinct from p_listing_id then
    return false;
  end if;
  if lower(trim(coalesce(b.status, ''))) <> 'confirmed' then
    return false;
  end if;
  if lower(trim(coalesce(b.payment_status, ''))) not in ('paid', 'complete', 'succeeded') then
    return false;
  end if;
  if not public.booking_traveler_owns(b.guest_user_id, b.guest_email) then
    return false;
  end if;

  select * into l from public.listings where id = p_listing_id;
  if not found then
    return false;
  end if;
  -- Self-supplier review block (parity with migration 093 / 193).
  if l.supplier_id is not null and l.supplier_id = p_user_id then
    return false;
  end if;

  return public.booking_experience_started_for_review(b, l);
end;
$$;

comment on function public.traveler_may_write_review(uuid, uuid, uuid) is
  'Phase 1732: SECURITY DEFINER — traveler may insert/update a review for their paid confirmed booking even when the listing is draft/unpublished. Blocks self-supplier reviews.';

revoke all on function public.traveler_may_write_review(uuid, uuid, uuid) from public;
grant execute on function public.traveler_may_write_review(uuid, uuid, uuid) to authenticated;

drop policy if exists "Users can insert own review" on public.reviews;
create policy "Users can insert own review"
  on public.reviews for insert
  with check (
    auth.uid() = reviews.user_id
    and reviews.booking_id is not null
    and public.traveler_may_write_review(reviews.listing_id, reviews.booking_id, reviews.user_id)
  );

drop policy if exists "Users can update own review" on public.reviews;
create policy "Users can update own review"
  on public.reviews for update
  using (auth.uid() = reviews.user_id)
  with check (
    auth.uid() = reviews.user_id
    and reviews.booking_id is not null
    and public.traveler_may_write_review(reviews.listing_id, reviews.booking_id, reviews.user_id)
  );

comment on column public.reviews.booking_id is
  'Required verified booking link. RLS requires traveler_may_write_review (Phase 1732): owned paid+confirmed booking whose experience has started, not self-supplier — works when listing is draft.';
