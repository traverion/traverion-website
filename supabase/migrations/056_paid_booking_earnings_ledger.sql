-- Post supplier booking_earnings when a booking is paid. Unique (kind, source_id)
-- makes webhook retries idempotent. Money still uses collected + non-earning
-- adjustments so journal earnings are not added twice.

create or replace function public.record_paid_booking_earnings(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier uuid;
  v_amount numeric;
  v_currency text;
  v_status text;
  v_pay text;
  v_id uuid;
begin
  select
    l.supplier_id,
    b.amount_paid,
    upper(trim(coalesce(nullif(b.currency, ''), 'EUR'))),
    lower(trim(coalesce(b.status, ''))),
    lower(trim(coalesce(b.payment_status, '')))
    into v_supplier, v_amount, v_currency, v_status, v_pay
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = p_booking_id;

  if v_supplier is null then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;
  if v_status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'cancelled');
  end if;
  if v_pay not in ('paid', 'complete', 'succeeded') or v_amount is null or v_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'not_paid');
  end if;

  insert into public.supplier_ledger_entries (
    supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
  ) values (
    v_supplier,
    p_booking_id,
    'booking_earnings',
    v_amount,
    v_currency,
    'Paid booking',
    p_booking_id::text,
    'traverion_supplier_ledger_v1'
  )
  on conflict (kind, source_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.supplier_ledger_entries
    where kind = 'booking_earnings' and source_id = p_booking_id::text;
    return jsonb_build_object('ok', true, 'id', v_id, 'already', true, 'amount', v_amount);
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'already', false, 'amount', v_amount);
end;
$$;

comment on function public.record_paid_booking_earnings(uuid) is
  'Inserts one booking_earnings row for a paid, non-cancelled booking. Idempotent on (kind, source_id).';

revoke all on function public.record_paid_booking_earnings(uuid) from public;
revoke all on function public.record_paid_booking_earnings(uuid) from anon;
revoke all on function public.record_paid_booking_earnings(uuid) from authenticated;
grant execute on function public.record_paid_booking_earnings(uuid) to service_role;

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
  values (v_req.booking_id, 'system', v_uid, 'Traveler accepted the cancellation. This booking is cancelled.');

  return jsonb_build_object(
    'ok', true,
    'id', v_req.id,
    'status', 'accepted',
    'ledger_id', v_ledger_id
  );
end;
$$;
