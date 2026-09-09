-- Phase 71: system thread after accept-cancel must state Refund due (manual Stripe), matching Trips/Money.

create or replace function public.respond_cancellation_request(
  p_request_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.cancellation_requests%rowtype;
  v_supplier uuid;
  v_guest_user uuid;
  v_guest_email text;
  v_jwt_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_ledger_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;

  select * into v_req from public.cancellation_requests where id = p_request_id;
  if v_req.id is null then
    return jsonb_build_object('ok', false, 'error', 'This cancellation request is not available.');
  end if;

  select l.supplier_id, b.guest_user_id, b.guest_email
    into v_supplier, v_guest_user, v_guest_email
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = v_req.booking_id;

  if not (
    v_guest_user = v_uid
    or (length(v_jwt_email) > 0 and lower(trim(coalesce(v_guest_email, ''))) = v_jwt_email)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Only the traveler on this booking can respond.');
  end if;

  if v_req.status = 'accepted' then
    return jsonb_build_object('ok', true, 'id', v_req.id, 'already', true);
  end if;
  if v_req.status <> 'requested' then
    return jsonb_build_object('ok', false, 'error', 'This cancellation request is no longer open.');
  end if;

  if not p_accept then
    update public.cancellation_requests
      set status = 'declined', responded_at = now(), responded_by = v_uid
    where id = v_req.id and status = 'requested';
    insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
    values (v_req.booking_id, 'system', v_uid, 'Traveler declined the cancellation request. The booking stays active.');
    return jsonb_build_object('ok', true, 'id', v_req.id, 'status', 'declined');
  end if;

  update public.cancellation_requests
    set status = 'accepted', responded_at = now(), responded_by = v_uid
  where id = v_req.id and status = 'requested';
  if not found then
    return jsonb_build_object('ok', true, 'id', v_req.id, 'already', true);
  end if;

  update public.bookings
    set
      status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = v_req.reason_code,
      refund_choice = 'full_refund'
    where id = v_req.booking_id
      and lower(trim(coalesce(status, ''))) <> 'cancelled';

  if v_req.applied_fee > 0 and v_supplier is not null then
    insert into public.supplier_ledger_entries (
      supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
    ) values (
      v_supplier,
      v_req.booking_id,
      'cancellation_penalty',
      - abs(v_req.applied_fee),
      v_req.fee_currency,
      'Supplier cancellation fee',
      v_req.id::text,
      coalesce(v_req.policy_snapshot ->> 'policy_id', 'traverion_supplier_cancel_v1')
    )
    on conflict (kind, source_id) do nothing
    returning id into v_ledger_id;
  end if;

  -- Reverse posted earnings so a cancelled paid booking does not keep supplier credit.
  insert into public.supplier_ledger_entries (
    supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
  )
  select
    e.supplier_id,
    e.booking_id,
    'refund',
    - abs(e.amount),
    e.currency,
    'Cancelled booking earnings reversal',
    e.booking_id::text,
    coalesce(v_req.policy_snapshot ->> 'policy_id', 'traverion_supplier_ledger_v1')
  from public.supplier_ledger_entries e
  where e.kind = 'booking_earnings'
    and e.booking_id = v_req.booking_id
  on conflict (kind, source_id) do nothing;

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (
    v_req.booking_id,
    'system',
    v_uid,
    'Traveler accepted the cancellation. This booking is cancelled. Status: Refund due until Stripe records a refund. Traverion does not send Stripe refunds automatically.'
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_req.id,
    'status', 'accepted',
    'ledger_id', v_ledger_id
  );
end;
$$;
