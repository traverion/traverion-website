-- Phase 3 of 6: Supplier cancel before official start → customer chooses
-- full refund OR reschedule (Tours). Stays keep immediate full-refund path.
-- Deadline auto-claim + durable refund instruction; inventory-safe reschedule.

-- ---------------------------------------------------------------------------
-- Patch request_supplier_cancellation
-- Tours before start → pending_customer_choice (no Stripe yet)
-- Tours at/after start → full_refund instruction
-- Stays always → full_refund instruction (never pending choice / reschedule)
-- ---------------------------------------------------------------------------
create or replace function public.request_supplier_cancellation(
  p_booking_id uuid,
  p_reason_code text,
  p_reason_text text,
  p_evidence_note text default null,
  p_policy_snapshot jsonb default '{}'::jsonb,
  p_applied_fee numeric default 0,
  p_fee_currency text default 'EUR'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_supplier uuid;
  v_listing_id uuid;
  v_status text;
  v_pay text;
  v_booking_currency text;
  v_code text := upper(trim(coalesce(p_reason_code, '')));
  v_text text := left(trim(coalesce(p_reason_text, '')), 2000);
  v_evidence text := left(trim(coalesce(p_evidence_note, '')), 2000);
  v_id uuid;
  v_allowed text[] := array[
    'FORCE_MAJEURE',
    'UNSAFE_WEATHER',
    'GOVERNMENT_RESTRICTION',
    'SUPPLIER_STAFF_UNAVAILABLE',
    'VEHICLE_OR_EQUIPMENT_FAILURE',
    'OVERBOOKING',
    'MINIMUM_PARTICIPATION_NOT_MET',
    'OPERATIONAL_ERROR',
    'TRAVELER_REQUESTED_DIRECTLY',
    'OTHER'
  ];
  v_fm boolean;
  v_fee numeric := coalesce(p_applied_fee, 0);
  v_booking public.bookings%rowtype;
  v_refund_prep jsonb;
  v_ledger_id uuid;
  v_body text;
  v_resolution text;
  v_official_start timestamptz;
  v_before_start boolean;
  v_is_stay boolean;
  v_needs_choice boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;
  if v_code <> all (v_allowed) then
    return jsonb_build_object('ok', false, 'error', 'Choose a cancellation reason.');
  end if;
  if char_length(v_text) < 12 then
    return jsonb_build_object('ok', false, 'error', 'Explain what happened (at least a short sentence).');
  end if;

  v_fm := v_code in ('FORCE_MAJEURE', 'UNSAFE_WEATHER', 'GOVERNMENT_RESTRICTION');
  if v_fm and char_length(v_text) < 24 then
    return jsonb_build_object('ok', false, 'error', 'Force majeure needs a clear explanation of why the trip cannot run.');
  end if;

  if v_fm then
    v_fee := 0;
  else
    v_fee := 20;
  end if;

  select l.supplier_id, b.listing_id, b.status, lower(trim(coalesce(b.payment_status, ''))),
    upper(trim(coalesce(b.currency, 'EUR')))
    into v_supplier, v_listing_id, v_status, v_pay, v_booking_currency
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = p_booking_id;

  if v_listing_id is null or not public.is_listing_supplier_bookings_editor(v_listing_id) then
    return jsonb_build_object('ok', false, 'error', 'You can only cancel bookings for your own listings.');
  end if;
  if v_pay = 'refunded' then
    return jsonb_build_object('ok', false, 'error', 'This booking is already refunded.');
  end if;
  if lower(trim(coalesce(v_status, ''))) = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'This booking is already cancelled.');
  end if;
  if v_pay not in ('paid', 'complete', 'succeeded') then
    return jsonb_build_object('ok', false, 'error', 'Only paid bookings can go through this cancellation.');
  end if;

  update public.cancellation_requests
    set status = 'resolved', responded_at = now(), responded_by = v_uid
    where booking_id = p_booking_id and status = 'requested';

  insert into public.cancellation_requests (
    booking_id,
    requested_by,
    requester_user_id,
    reason_code,
    reason_text,
    evidence_note,
    status,
    policy_snapshot,
    applied_fee,
    fee_currency,
    traveler_refund_expectation,
    expires_at,
    responded_at,
    responded_by
  ) values (
    p_booking_id,
    'supplier',
    v_uid,
    v_code,
    v_text,
    nullif(v_evidence, ''),
    'accepted',
    coalesce(p_policy_snapshot, '{}'::jsonb) || jsonb_build_object(
      'server_applied_fee', v_fee,
      'server_force_majeure', v_fm,
      'auto_accept_hours', null,
      'immediate_supplier_cancel', true,
      'client_requested_fee_currency', p_fee_currency
    ),
    v_fee,
    v_booking_currency,
    'full_refund',
    null,
    now(),
    v_uid
  )
  returning id into v_id;

  perform set_config('app.bypass_booking_cancellation_guard', 'true', true);

  select * into v_booking from public.bookings where id = p_booking_id;
  v_is_stay := public.booking_is_stay_night(v_booking);
  v_official_start := public.booking_official_start_at(v_booking);
  -- Strict: before start. Exact start instant and after → auto refund.
  v_before_start := v_official_start is not null and v_official_start > now();
  -- Phase 3: only Tours get pending_customer_choice. Stays always full refund.
  v_needs_choice := (not v_is_stay) and v_before_start;
  v_resolution := case when v_needs_choice then 'pending_customer_choice' else 'full_refund' end;

  update public.bookings
    set
      status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = v_code,
      refund_choice = 'full_refund',
      cancellation_origin = 'supplier',
      cancellation_resolution = v_resolution
    where id = p_booking_id
      and lower(trim(coalesce(status, ''))) <> 'cancelled';

  if v_fee > 0 and v_supplier is not null then
    insert into public.supplier_ledger_entries (
      supplier_id, booking_id, kind, amount, currency, reason, source_id, policy_id
    ) values (
      v_supplier,
      p_booking_id,
      'cancellation_penalty',
      - abs(v_fee),
      v_booking_currency,
      'Supplier cancellation fee',
      v_id::text,
      coalesce(p_policy_snapshot ->> 'policy_id', 'traverion_supplier_cancel_v1')
    )
    on conflict (kind, source_id) do nothing
    returning id into v_ledger_id;
  end if;

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
    coalesce(p_policy_snapshot ->> 'policy_id', 'traverion_supplier_ledger_v1')
  from public.supplier_ledger_entries e
  where e.kind = 'booking_earnings'
    and e.booking_id = p_booking_id
  on conflict (kind, source_id) do nothing;

  v_refund_prep := null;
  if not v_needs_choice then
    v_refund_prep := public.ensure_booking_cancel_refund_instruction(
      p_booking_id,
      case
        when v_is_stay then 'supplier_cancel_stay_full_refund'
        else 'supplier_cancel_after_start_full_refund'
      end,
      v_uid
    );
  end if;

  if v_needs_choice then
    v_body :=
      'Operator cancelled this booking before the scheduled start. Choose a full refund or another available departure in Trips before the original start time. If you do not choose, a full refund begins automatically at that deadline.';
  elsif coalesce((v_refund_prep->>'ok')::boolean, false)
    and coalesce(v_refund_prep->>'skipped', 'false') <> 'true' then
    v_body :=
      'Operator cancelled this booking. A full refund has been queued with Stripe. Status updates when Stripe confirms the refund.';
  else
    v_body :=
      'Operator cancelled this booking. A full refund is due. Status: Refund due until Stripe records a refund.';
  end if;

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (p_booking_id, 'system', v_uid, v_body);

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'applied_fee', v_fee,
    'fee_currency', v_booking_currency,
    'immediate', true,
    'refund_choice', 'full_refund',
    'cancellation_resolution', v_resolution,
    'before_official_start', v_before_start,
    'is_stay', v_is_stay,
    'needs_customer_choice', v_needs_choice,
    'auto_refund_queued', coalesce((v_refund_prep->>'ok')::boolean, false)
      and coalesce(v_refund_prep->>'skipped', 'false') <> 'true',
    'refund_instruction_id', v_refund_prep->>'id',
    'ledger_id', v_ledger_id
  );
end;
$$;

revoke all on function public.request_supplier_cancellation(uuid, text, text, text, jsonb, numeric, text) from public;
grant execute on function public.request_supplier_cancellation(uuid, text, text, text, jsonb, numeric, text) to authenticated;

comment on function public.request_supplier_cancellation(uuid, text, text, text, jsonb, numeric, text) is
  'Phase 3: Tour before start → pending_customer_choice. Tour at/after start + Stay always → full_refund instruction.';

-- ---------------------------------------------------------------------------
-- Atomic claim: pending_customer_choice → full_refund + refund instruction
-- ---------------------------------------------------------------------------
create or replace function public.claim_supplier_cancel_refund_choice(
  p_booking_id uuid,
  p_reason text default 'supplier_cancel_customer_chose_refund'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(), '');
  v_booking public.bookings%rowtype;
  v_claimed uuid;
  v_refund_prep jsonb;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null then
    v_reason := 'supplier_cancel_customer_chose_refund';
  end if;

  if v_uid is null and v_role is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    return jsonb_build_object('ok', false, 'error', 'This booking is not available.');
  end if;

  if v_uid is not null
     and not public.booking_traveler_owns(v_booking.guest_user_id, v_booking.guest_email) then
    return jsonb_build_object('ok', false, 'error', 'Only the traveler on this booking can choose a resolution.');
  end if;

  if lower(trim(coalesce(v_booking.status, ''))) <> 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'This booking is not cancelled.');
  end if;

  if lower(trim(coalesce(v_booking.cancellation_origin, ''))) is distinct from 'supplier' then
    return jsonb_build_object('ok', false, 'error', 'This cancellation is not awaiting a customer choice.');
  end if;

  update public.bookings
    set
      cancellation_resolution = 'full_refund',
      refund_choice = 'full_refund'
    where id = p_booking_id
      and lower(trim(coalesce(status, ''))) = 'cancelled'
      and lower(trim(coalesce(cancellation_resolution, ''))) = 'pending_customer_choice'
  returning id into v_claimed;

  if v_claimed is null then
    select * into v_booking from public.bookings where id = p_booking_id;
    return jsonb_build_object(
      'ok', false,
      'error', 'already_resolved',
      'cancellation_resolution', v_booking.cancellation_resolution,
      'skipped', true
    );
  end if;

  v_refund_prep := public.ensure_booking_cancel_refund_instruction(
    p_booking_id,
    v_reason,
    v_uid
  );

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (
    p_booking_id,
    'system',
    v_uid,
    case
      when v_reason = 'supplier_cancel_deadline_auto_refund' then
        'No resolution was chosen before the original start time. A full refund has been queued automatically.'
      else
        'You chose a full refund. Stripe will process it; Trips shows Refunded when Stripe confirms.'
    end
  );

  return jsonb_build_object(
    'ok', true,
    'booking_id', p_booking_id,
    'cancellation_resolution', 'full_refund',
    'auto_refund_queued', coalesce((v_refund_prep->>'ok')::boolean, false)
      and coalesce(v_refund_prep->>'skipped', 'false') <> 'true',
    'refund_instruction_id', v_refund_prep->>'id',
    'refund_prep', v_refund_prep
  );
end;
$$;

revoke all on function public.claim_supplier_cancel_refund_choice(uuid, text) from public;
revoke all on function public.claim_supplier_cancel_refund_choice(uuid, text) from anon;
grant execute on function public.claim_supplier_cancel_refund_choice(uuid, text) to authenticated;
grant execute on function public.claim_supplier_cancel_refund_choice(uuid, text) to service_role;

comment on function public.claim_supplier_cancel_refund_choice(uuid, text) is
  'Phase 3: atomically claim pending_customer_choice → full_refund and queue cancel-refund instruction. Race-safe vs deadline/reschedule.';

-- ---------------------------------------------------------------------------
-- Deadline processor (service_role / cron). Exact boundary: official_start <= now()
-- ---------------------------------------------------------------------------
create or replace function public.process_pending_supplier_cancel_deadlines(
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), '');
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 100));
  v_row public.bookings%rowtype;
  v_claimed int := 0;
  v_skipped int := 0;
  v_failed int := 0;
  v_result jsonb;
  v_ids uuid[] := array[]::uuid[];
  v_errors jsonb := '[]'::jsonb;
begin
  if v_role is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'service_role_required');
  end if;

  for v_row in
    select b.*
    from public.bookings b
    where lower(trim(coalesce(b.status, ''))) = 'cancelled'
      and lower(trim(coalesce(b.cancellation_resolution, ''))) = 'pending_customer_choice'
      and lower(trim(coalesce(b.cancellation_origin, ''))) = 'supplier'
      and public.booking_official_start_at(b) is not null
      and public.booking_official_start_at(b) <= now()
    order by public.booking_official_start_at(b) asc
    limit v_limit
  loop
    begin
      v_result := public.claim_supplier_cancel_refund_choice(
        v_row.id,
        'supplier_cancel_deadline_auto_refund'
      );
      if coalesce((v_result->>'ok')::boolean, false) then
        v_claimed := v_claimed + 1;
        v_ids := array_append(v_ids, v_row.id);
      else
        v_skipped := v_skipped + 1;
      end if;
    exception when others then
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('booking_id', v_row.id, 'error', SQLERRM)
      );
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'claimed', v_claimed,
    'skipped', v_skipped,
    'failed', v_failed,
    'booking_ids', to_jsonb(v_ids),
    'errors', v_errors
  );
end;
$$;

revoke all on function public.process_pending_supplier_cancel_deadlines(integer) from public;
revoke all on function public.process_pending_supplier_cancel_deadlines(integer) from anon;
revoke all on function public.process_pending_supplier_cancel_deadlines(integer) from authenticated;
grant execute on function public.process_pending_supplier_cancel_deadlines(integer) to service_role;

comment on function public.process_pending_supplier_cancel_deadlines(integer) is
  'Phase 3 cron: claim pending_customer_choice past official start → full_refund + instruction. No browser required.';

-- ---------------------------------------------------------------------------
-- Reschedule onto a real available tour departure (same option / payment)
-- ---------------------------------------------------------------------------
create or replace function public.reschedule_supplier_cancelled_booking(
  p_booking_id uuid,
  p_new_date date,
  p_new_start_time text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old public.bookings%rowtype;
  v_new_id uuid;
  v_hm text;
  v_start time;
  v_option text;
  v_snap jsonb;
  v_official_start timestamptz;
  v_claimed uuid;
  v_old_day date;
  v_old_hm text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;
  if p_new_date is null then
    return jsonb_build_object('ok', false, 'error', 'Choose a new date.');
  end if;

  v_hm := nullif(trim(coalesce(p_new_start_time, '')), '');
  if v_hm is null or v_hm !~ '^\d{1,2}:\d{2}' then
    return jsonb_build_object('ok', false, 'error', 'Choose a departure time.');
  end if;
  begin
    v_hm := lpad(split_part(v_hm, ':', 1), 2, '0') || ':' || substring(split_part(v_hm, ':', 2) from 1 for 2);
    v_start := v_hm::time;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'Choose a valid departure time.');
  end;

  select * into v_old from public.bookings where id = p_booking_id for update;
  if v_old.id is null then
    return jsonb_build_object('ok', false, 'error', 'This booking is not available.');
  end if;

  if not public.booking_traveler_owns(v_old.guest_user_id, v_old.guest_email) then
    return jsonb_build_object('ok', false, 'error', 'Only the traveler on this booking can reschedule.');
  end if;

  if public.booking_is_stay_night(v_old) then
    return jsonb_build_object(
      'ok', false,
      'error', 'Stay reschedule is not available here. Choose a full refund, or contact Traverion Support.',
      'stay_reschedule_unsupported', true
    );
  end if;

  if lower(trim(coalesce(v_old.status, ''))) <> 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'This booking is not cancelled.');
  end if;
  if lower(trim(coalesce(v_old.cancellation_origin, ''))) is distinct from 'supplier' then
    return jsonb_build_object('ok', false, 'error', 'This cancellation is not awaiting a customer choice.');
  end if;
  if lower(trim(coalesce(v_old.cancellation_resolution, ''))) is distinct from 'pending_customer_choice' then
    return jsonb_build_object(
      'ok', false,
      'error', 'already_resolved',
      'cancellation_resolution', v_old.cancellation_resolution,
      'skipped', true
    );
  end if;
  if lower(trim(coalesce(v_old.payment_status, ''))) = 'refunded' then
    return jsonb_build_object('ok', false, 'error', 'This booking is already refunded.');
  end if;
  if lower(trim(coalesce(v_old.payment_status, ''))) not in ('paid', 'complete', 'succeeded') then
    return jsonb_build_object('ok', false, 'error', 'Only paid bookings can be rescheduled.');
  end if;

  v_official_start := public.booking_official_start_at(v_old);
  -- Deadline race: once official start is reached, scheduler wins → refund only.
  if v_official_start is null or v_official_start <= now() then
    return jsonb_build_object(
      'ok', false,
      'error', 'The choice deadline has passed. Your full refund will begin automatically.',
      'deadline_passed', true
    );
  end if;

  v_old_day := v_old.booking_date;
  v_old_hm := nullif(trim(coalesce(v_old.purchase_snapshot->>'cancelReferenceStartHm', '')), '');
  if v_old_hm is null then
    v_old_hm := nullif(trim(coalesce(v_old.purchase_snapshot->>'startTimeHm', '')), '');
  end if;
  if v_old_hm is null and v_old.start_time is not null then
    v_old_hm := to_char(v_old.start_time, 'HH24:MI');
  end if;
  if v_old_day is not null and v_old_day = p_new_date and coalesce(v_old_hm, '') = v_hm then
    return jsonb_build_object('ok', false, 'error', 'Choose a different departure than the cancelled one.');
  end if;

  v_option := nullif(trim(coalesce(v_old.booking_option_id, '')), '');
  if v_option is null then
    v_option := nullif(trim(coalesce(v_old.purchase_snapshot->>'optionId', '')), '');
  end if;

  -- Assert real inventory/capacity before claiming resolution (still pending).
  begin
    perform public.assert_checkout_inventory(
      v_old.listing_id,
      p_new_date,
      greatest(coalesce(v_old.guests, 1), 1),
      null,
      v_old.id,
      v_start,
      v_option
    );
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'error', SQLERRM,
      'inventory_unavailable', true
    );
  end;

  -- Claim resolution BEFORE insert so concurrent refund/reschedule cannot both win.
  update public.bookings
    set cancellation_resolution = 'reschedule'
    where id = p_booking_id
      and lower(trim(coalesce(cancellation_resolution, ''))) = 'pending_customer_choice'
      and lower(trim(coalesce(status, ''))) = 'cancelled'
  returning id into v_claimed;

  if v_claimed is null then
    select cancellation_resolution into v_old.cancellation_resolution
    from public.bookings where id = p_booking_id;
    return jsonb_build_object(
      'ok', false,
      'error', 'already_resolved',
      'cancellation_resolution', v_old.cancellation_resolution,
      'skipped', true
    );
  end if;

  -- Re-assert after claim (departure may have sold out between assert and claim).
  begin
    perform public.assert_checkout_inventory(
      v_old.listing_id,
      p_new_date,
      greatest(coalesce(v_old.guests, 1), 1),
      null,
      v_old.id,
      v_start,
      v_option
    );
  exception when others then
    -- Roll claim back to pending so customer can refund or pick another date.
    update public.bookings
      set cancellation_resolution = 'pending_customer_choice'
      where id = p_booking_id
        and cancellation_resolution = 'reschedule';
    return jsonb_build_object(
      'ok', false,
      'error', SQLERRM,
      'inventory_unavailable', true
    );
  end;

  v_snap := coalesce(v_old.purchase_snapshot, '{}'::jsonb);
  v_snap := v_snap || jsonb_build_object(
    'startTimeHm', v_hm,
    'cancelReferenceStartHm', v_hm,
    'bookingDate', p_new_date::text,
    'rescheduledAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'rescheduledFromBookingId', v_old.id::text
  );

  insert into public.bookings (
    listing_id,
    guest_email,
    guest_name,
    guests,
    booking_date,
    status,
    special_requests,
    start_time,
    guest_user_id,
    payment_status,
    payment_provider,
    payment_intent_id,
    checkout_session_id,
    total_amount,
    amount_paid,
    currency,
    paid_at,
    booking_option_id,
    guest_breakdown,
    purchase_snapshot,
    rescheduled_from_booking_id
  ) values (
    v_old.listing_id,
    v_old.guest_email,
    v_old.guest_name,
    v_old.guests,
    p_new_date,
    'confirmed',
    v_old.special_requests,
    v_start,
    v_old.guest_user_id,
    'paid',
    coalesce(v_old.payment_provider, 'stripe'),
    v_old.payment_intent_id,
    null,
    v_old.total_amount,
    v_old.amount_paid,
    v_old.currency,
    coalesce(v_old.paid_at, now()),
    v_option,
    v_old.guest_breakdown,
    v_snap,
    v_old.id
  )
  returning id into v_new_id;

  update public.bookings
    set rescheduled_to_booking_id = v_new_id
    where id = v_old.id;

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (
    v_old.id,
    'system',
    v_uid,
    'You rescheduled this cancelled departure. No refund will be issued for this cancellation. See your new confirmed booking in Trips.'
  );

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (
    v_new_id,
    'system',
    v_uid,
    'Booking confirmed after operator cancellation reschedule. Payment from the original booking was preserved — you were not charged again.'
  );

  return jsonb_build_object(
    'ok', true,
    'old_booking_id', v_old.id,
    'new_booking_id', v_new_id,
    'booking_date', p_new_date,
    'start_time', v_hm,
    'cancellation_resolution', 'reschedule'
  );
exception
  when others then
    -- Best-effort unlock if insert failed after claim.
    update public.bookings
      set cancellation_resolution = 'pending_customer_choice'
      where id = p_booking_id
        and cancellation_resolution = 'reschedule'
        and rescheduled_to_booking_id is null;
    return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

revoke all on function public.reschedule_supplier_cancelled_booking(uuid, date, text) from public;
revoke all on function public.reschedule_supplier_cancelled_booking(uuid, date, text) from anon;
grant execute on function public.reschedule_supplier_cancelled_booking(uuid, date, text) to authenticated;

comment on function public.reschedule_supplier_cancelled_booking(uuid, date, text) is
  'Phase 3: Tours only. Atomically claim pending_customer_choice → reschedule, assert inventory, insert paid lineage booking without recharging.';

create index if not exists bookings_pending_customer_choice_idx
  on public.bookings (cancelled_at)
  where cancellation_resolution = 'pending_customer_choice';
