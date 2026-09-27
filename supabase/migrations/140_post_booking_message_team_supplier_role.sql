-- Phase 1141: team members post as supplier in booking messages
-- (is_booking_party already allows them after 137; sender_role was still traveler).

create or replace function public.post_booking_message(p_booking_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := left(trim(coalesce(p_body, '')), 4000);
  v_supplier uuid;
  v_listing_id uuid;
  v_status text;
  v_pay text;
  v_role text;
  v_id uuid;
  v_open_cancel boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to send a message.');
  end if;
  if char_length(v_body) < 1 then
    return jsonb_build_object('ok', false, 'error', 'Write a message before sending.');
  end if;

  select l.supplier_id, b.listing_id, b.status, lower(trim(coalesce(b.payment_status, '')))
    into v_supplier, v_listing_id, v_status, v_pay
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = p_booking_id;

  if v_supplier is null then
    return jsonb_build_object('ok', false, 'error', 'This booking is not available.');
  end if;

  if not public.is_booking_party(p_booking_id) then
    return jsonb_build_object('ok', false, 'error', 'You can only message about a booking you are part of.');
  end if;

  select exists (
    select 1 from public.cancellation_requests cr
    where cr.booking_id = p_booking_id and cr.status = 'requested'
  ) into v_open_cancel;

  if v_pay = 'refunded' then
    return jsonb_build_object('ok', false, 'error', 'This booking is closed. You can still read earlier messages.');
  end if;

  if v_pay not in ('paid', 'complete', 'succeeded') then
    return jsonb_build_object('ok', false, 'error', 'Messaging opens after this booking is paid.');
  end if;

  if lower(trim(coalesce(v_status, ''))) = 'cancelled' and not v_open_cancel then
    return jsonb_build_object('ok', false, 'error', 'This booking is closed. You can still read earlier messages.');
  end if;

  if v_supplier = v_uid or public.is_listing_supplier_side(v_listing_id) then
    v_role := 'supplier';
  else
    v_role := 'traveler';
  end if;

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (p_booking_id, v_role, v_uid, v_body)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

comment on function public.post_booking_message(uuid, text) is
  'Party-gated booking chat; supplier-side (owner or team) posts as supplier.';
