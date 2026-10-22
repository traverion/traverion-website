-- Step 2.3: automatic Stay cancellation refunds.
-- Durable refund intent (booking_refund_instructions) before Stripe.
-- Stripe execution lives in edge function execute-booking-refund.
-- payment_status becomes refunded only when Stripe webhook confirms.
-- Tours keep manual Refund due unless they share the same instruction path later.

-- ---------------------------------------------------------------------------
-- Booking auto-refund tracking (visible to traveler/supplier via RLS)
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists auto_refund_status text
    check (
      auto_refund_status is null
      or auto_refund_status in ('queued', 'processing', 'submitted', 'failed')
    );

alter table public.bookings
  add column if not exists auto_refund_error text;

alter table public.bookings
  add column if not exists auto_refund_stripe_id text;

alter table public.bookings
  add column if not exists auto_refund_updated_at timestamptz;

comment on column public.bookings.auto_refund_status is
  'Stay auto-refund pipeline: queued→processing→submitted; failed needs recovery. Cleared conceptually once payment_status=refunded.';

-- ---------------------------------------------------------------------------
-- Ensure durable cancel-refund instruction (idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.ensure_stay_cancel_refund_instruction(
  p_booking_id uuid,
  p_reason text default 'stay_cancellation_full_refund',
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_is_stay boolean;
  v_key text;
  v_amount_minor bigint;
  v_currency text;
  v_existing public.booking_refund_instructions%rowtype;
  v_id uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  v_is_stay := public.booking_is_stay_night(v_booking);
  if not v_is_stay then
    return jsonb_build_object('ok', false, 'error', 'not_stay', 'skipped', true);
  end if;

  if lower(trim(coalesce(v_booking.status, ''))) <> 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'not_cancelled');
  end if;

  if lower(trim(coalesce(v_booking.refund_choice, ''))) <> 'full_refund' then
    return jsonb_build_object('ok', false, 'error', 'no_refund_entitlement', 'skipped', true);
  end if;

  if lower(trim(coalesce(v_booking.payment_status, ''))) = 'refunded' then
    return jsonb_build_object('ok', true, 'already_refunded', true);
  end if;

  if lower(trim(coalesce(v_booking.payment_status, ''))) not in ('paid', 'complete', 'succeeded') then
    return jsonb_build_object('ok', false, 'error', 'not_paid');
  end if;

  if nullif(trim(coalesce(v_booking.payment_intent_id, '')), '') is null then
    update public.bookings
      set
        auto_refund_status = 'failed',
        auto_refund_error = 'missing_payment_intent',
        auto_refund_updated_at = now()
      where id = p_booking_id;
    return jsonb_build_object('ok', false, 'error', 'missing_payment_intent');
  end if;

  v_currency := upper(trim(coalesce(nullif(v_booking.currency, ''), 'EUR')));
  v_amount_minor := public.commercial_amount_to_minor(coalesce(v_booking.amount_paid, 0));
  if v_amount_minor is null or v_amount_minor <= 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing_to_refund');
  end if;

  -- One stable cancel-refund identity per booking (retries reuse this key).
  v_key := 'stay-cancel-refund:' || p_booking_id::text;

  select * into v_existing
  from public.booking_refund_instructions
  where idempotency_key = v_key;

  if v_existing.id is not null then
    update public.bookings
      set
        auto_refund_status = case
          when v_existing.status = 'succeeded' then coalesce(auto_refund_status, 'submitted')
          when v_existing.status = 'failed' then 'failed'
          when v_existing.status = 'processing' then 'processing'
          when v_existing.status = 'ready' then 'queued'
          else coalesce(auto_refund_status, 'queued')
        end,
        auto_refund_stripe_id = coalesce(v_existing.stripe_refund_id, auto_refund_stripe_id),
        auto_refund_updated_at = now()
      where id = p_booking_id
        and lower(trim(coalesce(payment_status, ''))) <> 'refunded';

    return jsonb_build_object(
      'ok', true,
      'already', true,
      'id', v_existing.id,
      'status', v_existing.status,
      'idempotency_key', v_key,
      'amount_minor', v_existing.amount_minor,
      'currency', v_existing.currency
    );
  end if;

  insert into public.booking_refund_instructions (
    booking_id, idempotency_key, kind, amount_minor, currency, reason, status, created_by, note
  ) values (
    p_booking_id,
    v_key,
    'remaining',
    v_amount_minor,
    v_currency,
    nullif(btrim(coalesce(p_reason, '')), ''),
    'ready',
    p_actor_id,
    'Stay cancellation auto-refund — execute via execute-booking-refund edge function.'
  )
  returning id into v_id;

  update public.bookings
    set
      auto_refund_status = 'queued',
      auto_refund_error = null,
      auto_refund_updated_at = now()
    where id = p_booking_id;

  insert into public.financial_audit_log (
    actor_id, action, booking_id, amount_minor, currency, reason, after_state
  ) values (
    p_actor_id,
    'ensure_stay_cancel_refund_instruction',
    p_booking_id,
    v_amount_minor,
    v_currency,
    p_reason,
    jsonb_build_object('instruction_id', v_id, 'idempotency_key', v_key)
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'status', 'ready',
    'idempotency_key', v_key,
    'amount_minor', v_amount_minor,
    'currency', v_currency
  );
end;
$$;

revoke all on function public.ensure_stay_cancel_refund_instruction(uuid, text, uuid) from public;
revoke all on function public.ensure_stay_cancel_refund_instruction(uuid, text, uuid) from anon;
grant execute on function public.ensure_stay_cancel_refund_instruction(uuid, text, uuid) to authenticated;
grant execute on function public.ensure_stay_cancel_refund_instruction(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Claim instruction for Stripe execution (ready → processing; stale reclaim)
-- ---------------------------------------------------------------------------
create or replace function public.claim_refund_instruction_for_execution(
  p_idempotency_key text,
  p_stale_after_seconds int default 120
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.booking_refund_instructions%rowtype;
  v_stale interval := make_interval(secs => greatest(30, coalesce(p_stale_after_seconds, 120)));
begin
  select * into v_row
  from public.booking_refund_instructions
  where idempotency_key = nullif(btrim(coalesce(p_idempotency_key, '')), '')
  for update;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'instruction_not_found');
  end if;

  if v_row.status = 'succeeded' then
    return jsonb_build_object(
      'ok', true,
      'already', true,
      'id', v_row.id,
      'status', v_row.status,
      'stripe_refund_id', v_row.stripe_refund_id,
      'amount_minor', v_row.amount_minor,
      'currency', v_row.currency,
      'booking_id', v_row.booking_id
    );
  end if;

  if v_row.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'instruction_cancelled');
  end if;

  -- Reclaim stale processing without a Stripe id (timeout / crash before submit).
  if v_row.status = 'processing'
     and nullif(trim(coalesce(v_row.stripe_refund_id, '')), '') is null
     and v_row.updated_at < now() - v_stale
  then
    update public.booking_refund_instructions
      set status = 'ready', updated_at = now(), provider_error = 'reclaimed_stale_processing'
      where id = v_row.id;
    v_row.status := 'ready';
  end if;

  -- Already submitted to Stripe — return for reconcile (do not create a second refund).
  if v_row.status = 'processing' and nullif(trim(coalesce(v_row.stripe_refund_id, '')), '') is not null then
    return jsonb_build_object(
      'ok', true,
      'already', true,
      'id', v_row.id,
      'status', 'submitted',
      'stripe_refund_id', v_row.stripe_refund_id,
      'amount_minor', v_row.amount_minor,
      'currency', v_row.currency,
      'booking_id', v_row.booking_id
    );
  end if;

  if v_row.status not in ('ready', 'failed') then
    return jsonb_build_object(
      'ok', false,
      'error', 'not_claimable',
      'status', v_row.status,
      'id', v_row.id,
      'stripe_refund_id', v_row.stripe_refund_id
    );
  end if;

  update public.booking_refund_instructions
    set
      status = 'processing',
      updated_at = now(),
      provider_error = null
    where id = v_row.id
      and status in ('ready', 'failed')
  returning * into v_row;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'claim_race');
  end if;

  update public.bookings
    set
      auto_refund_status = 'processing',
      auto_refund_error = null,
      auto_refund_updated_at = now()
    where id = v_row.booking_id
      and lower(trim(coalesce(payment_status, ''))) <> 'refunded';

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'status', 'processing',
    'amount_minor', v_row.amount_minor,
    'currency', v_row.currency,
    'booking_id', v_row.booking_id,
    'idempotency_key', v_row.idempotency_key
  );
end;
$$;

revoke all on function public.claim_refund_instruction_for_execution(text, int) from public;
revoke all on function public.claim_refund_instruction_for_execution(text, int) from anon, authenticated;
grant execute on function public.claim_refund_instruction_for_execution(text, int) to service_role;

-- ---------------------------------------------------------------------------
-- Record Stripe submission (refund created; await webhook for payment_status)
-- ---------------------------------------------------------------------------
create or replace function public.mark_refund_instruction_submitted(
  p_idempotency_key text,
  p_stripe_refund_id text,
  p_stripe_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.booking_refund_instructions%rowtype;
  v_stripe_status text := lower(trim(coalesce(p_stripe_status, '')));
begin
  update public.booking_refund_instructions
    set
      stripe_refund_id = nullif(btrim(coalesce(p_stripe_refund_id, '')), ''),
      status = case
        when v_stripe_status = 'succeeded' then 'succeeded'
        when v_stripe_status = 'failed' then 'failed'
        when v_stripe_status = 'canceled' then 'cancelled'
        else 'processing'
      end,
      executed_at = coalesce(executed_at, now()),
      updated_at = now(),
      provider_error = null
    where idempotency_key = nullif(btrim(coalesce(p_idempotency_key, '')), '')
  returning * into v_row;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'instruction_not_found');
  end if;

  update public.bookings
    set
      auto_refund_status = case
        when v_row.status = 'succeeded' then 'submitted'
        when v_row.status = 'failed' then 'failed'
        else 'submitted'
      end,
      auto_refund_stripe_id = v_row.stripe_refund_id,
      auto_refund_error = null,
      auto_refund_updated_at = now()
    where id = v_row.booking_id
      and lower(trim(coalesce(payment_status, ''))) <> 'refunded';

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'status', v_row.status,
    'stripe_refund_id', v_row.stripe_refund_id
  );
end;
$$;

revoke all on function public.mark_refund_instruction_submitted(text, text, text) from public;
revoke all on function public.mark_refund_instruction_submitted(text, text, text) from anon, authenticated;
grant execute on function public.mark_refund_instruction_submitted(text, text, text) to service_role;

create or replace function public.mark_refund_instruction_failed(
  p_idempotency_key text,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.booking_refund_instructions%rowtype;
  v_err text := left(nullif(btrim(coalesce(p_error, '')), ''), 2000);
begin
  update public.booking_refund_instructions
    set
      status = 'failed',
      provider_error = v_err,
      updated_at = now()
    where idempotency_key = nullif(btrim(coalesce(p_idempotency_key, '')), '')
      and status <> 'succeeded'
  returning * into v_row;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'instruction_not_found');
  end if;

  update public.bookings
    set
      auto_refund_status = 'failed',
      auto_refund_error = v_err,
      auto_refund_updated_at = now()
    where id = v_row.booking_id
      and lower(trim(coalesce(payment_status, ''))) <> 'refunded';

  return jsonb_build_object('ok', true, 'id', v_row.id, 'status', 'failed');
end;
$$;

revoke all on function public.mark_refund_instruction_failed(text, text) from public;
revoke all on function public.mark_refund_instruction_failed(text, text) from anon, authenticated;
grant execute on function public.mark_refund_instruction_failed(text, text) to service_role;

-- Webhook confirmation: mark instructions succeeded when charge fully refunded.
create or replace function public.mark_booking_refund_instructions_succeeded(
  p_booking_id uuid,
  p_stripe_refund_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.booking_refund_instructions
    set
      status = 'succeeded',
      stripe_refund_id = coalesce(nullif(btrim(coalesce(p_stripe_refund_id, '')), ''), stripe_refund_id),
      executed_at = coalesce(executed_at, now()),
      updated_at = now(),
      provider_error = null
    where booking_id = p_booking_id
      and status in ('ready', 'processing', 'failed');

  update public.bookings
    set
      auto_refund_status = null,
      auto_refund_error = null,
      auto_refund_stripe_id = coalesce(
        nullif(btrim(coalesce(p_stripe_refund_id, '')), ''),
        auto_refund_stripe_id
      ),
      auto_refund_updated_at = now()
    where id = p_booking_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.mark_booking_refund_instructions_succeeded(uuid, text) from public;
revoke all on function public.mark_booking_refund_instructions_succeeded(uuid, text) from anon, authenticated;
grant execute on function public.mark_booking_refund_instructions_succeeded(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Patch cancel_booking_as_traveler: queue instruction + auto-refund messaging
-- ---------------------------------------------------------------------------
create or replace function public.cancel_booking_as_traveler(
  p_booking_id uuid,
  p_refund_choice text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_jwt_email text := coalesce(public.jwt_verified_email(), '');
  v_booking public.bookings%rowtype;
  v_listing public.listings%rowtype;
  v_supplier uuid;
  v_body text;
  v_choice text := lower(trim(coalesce(p_refund_choice, '')));
  v_pay text;
  v_collected boolean;
  v_tz text;
  v_start_local timestamp;
  v_tour_start timestamptz;
  v_within_free_window boolean;
  v_hm text;
  v_hh int;
  v_mm int;
  v_is_stay boolean;
  v_closed_requests int := 0;
  v_preset text;
  v_policy text;
  v_free_hours int;
  v_hours_raw jsonb;
  v_refund_prep jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;

  if v_choice not in ('full_refund', 'no_refund') then
    return jsonb_build_object('ok', false, 'error', 'Invalid refund choice.');
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    return jsonb_build_object('ok', false, 'error', 'This booking is not available.');
  end if;

  if not public.booking_traveler_owns(v_booking.guest_user_id, v_booking.guest_email) then
    return jsonb_build_object('ok', false, 'error', 'Only the traveler on this booking can cancel.');
  end if;

  v_pay := lower(trim(coalesce(v_booking.payment_status, '')));
  if v_pay = 'refunded' then
    return jsonb_build_object('ok', false, 'error', 'This booking is already refunded.');
  end if;

  if v_pay = 'authorized' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Withdraw this stay request to release the payment authorization. Do not cancel while authorized.'
    );
  end if;

  if lower(trim(coalesce(v_booking.status, ''))) = 'cancelled' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  v_collected := v_pay in ('paid', 'complete', 'succeeded');
  if not v_collected then
    v_choice := 'no_refund';
  end if;

  if v_collected and v_choice = 'full_refund' and v_booking.booking_date is not null then
    select * into v_listing from public.listings where id = v_booking.listing_id;

    v_tz := nullif(trim(coalesce(v_booking.purchase_snapshot->>'departureTimezone', '')), '');
    if v_tz is null and v_listing.id is not null then
      v_tz := nullif(trim(coalesce(v_listing.listing_extras->>'departureTimezone', '')), '');
    end if;
    if v_tz is null or v_tz = '' then
      v_tz := 'Europe/Helsinki';
    end if;

    v_is_stay := public.booking_is_stay_night(v_booking);

    if v_is_stay then
      v_hm := nullif(trim(coalesce(v_booking.purchase_snapshot->>'checkInTime', '')), '');
      if v_hm is null then
        v_hm := '16:00';
      end if;
    else
      v_hm := nullif(trim(coalesce(v_booking.purchase_snapshot->>'startTimeHm', '')), '');
    end if;

    if v_hm is not null then
      begin
        v_hh := split_part(v_hm, ':', 1)::int;
        v_mm := split_part(v_hm, ':', 2)::int;
      exception when others then
        v_hh := case when v_is_stay then 16 else 0 end;
        v_mm := 0;
      end;
      v_start_local := v_booking.booking_date::timestamp + make_interval(hours => v_hh, mins => v_mm);
    else
      v_start_local :=
        (v_booking.booking_date::timestamp + coalesce(v_booking.start_time, time '00:00'));
    end if;

    begin
      v_tour_start := v_start_local at time zone v_tz;
    exception when others then
      v_tz := 'Europe/Helsinki';
      v_tour_start := v_start_local at time zone v_tz;
    end;

    v_preset := nullif(trim(coalesce(v_booking.purchase_snapshot->>'cancellationPreset', '')), '');
    v_hours_raw := v_booking.purchase_snapshot->'freeCancelHours';
    v_policy := lower(trim(coalesce(v_booking.purchase_snapshot->>'cancellationPolicy', '')));
    v_free_hours := null;

    if v_preset = 'non_refundable' then
      v_free_hours := null;
    elsif v_preset = 'free_24h' then
      v_free_hours := 24;
    elsif v_preset = 'free_48h' then
      v_free_hours := 48;
    elsif v_preset = 'free_7d' then
      v_free_hours := 168;
    elsif v_booking.purchase_snapshot ? 'freeCancelHours' then
      if jsonb_typeof(v_hours_raw) = 'null' then
        v_free_hours := null;
      else
        begin
          v_free_hours := (v_booking.purchase_snapshot->>'freeCancelHours')::int;
          if v_free_hours is not null and v_free_hours <= 0 then
            v_free_hours := null;
          end if;
        exception when others then
          v_free_hours := 24;
        end;
      end if;
    elsif v_policy <> '' then
      if (
        v_policy like '%non-refundable%'
        or v_policy like '%non refundable%'
      ) and v_policy not like '%up to 24%'
        and v_policy not like '%up to 48%'
        and v_policy not like '%up to 7%'
      then
        v_free_hours := null;
      elsif v_policy like '%7 days%' or v_policy like '%168 hour%' or v_policy like '%up to 7 day%' then
        v_free_hours := 168;
      elsif v_policy like '%48 hour%' or v_policy like '%up to 48%' then
        v_free_hours := 48;
      else
        v_free_hours := 24;
      end if;
    else
      v_free_hours := 24;
    end if;

    if v_free_hours is null then
      v_within_free_window := false;
    else
      v_within_free_window := v_tour_start - now() > make_interval(hours => v_free_hours);
    end if;

    if not v_within_free_window then
      v_choice := 'no_refund';
    end if;
  end if;

  perform set_config('app.bypass_booking_cancellation_guard', 'true', true);

  update public.bookings
    set
      status = 'cancelled',
      cancelled_at = now(),
      refund_choice = v_choice
    where id = v_booking.id
      and lower(trim(coalesce(status, ''))) <> 'cancelled';

  if not found then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  update public.cancellation_requests
    set
      status = 'resolved',
      responded_at = now(),
      responded_by = v_uid
    where booking_id = v_booking.id
      and status = 'requested';
  get diagnostics v_closed_requests = row_count;

  select l.supplier_id into v_supplier
  from public.listings l
  where l.id = v_booking.listing_id;

  if v_supplier is not null and v_collected and v_choice = 'full_refund' then
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
      'traverion_traveler_self_cancel_v1'
    from public.supplier_ledger_entries e
    where e.kind = 'booking_earnings'
      and e.booking_id = v_booking.id
    on conflict (kind, source_id) do nothing;
  end if;

  v_is_stay := public.booking_is_stay_night(v_booking);
  v_refund_prep := null;
  if v_collected and v_choice = 'full_refund' and v_is_stay then
    v_refund_prep := public.ensure_stay_cancel_refund_instruction(
      v_booking.id,
      'traveler_self_cancel_full_refund',
      v_uid
    );
  end if;

  if not v_collected then
    v_body :=
      'Traveler cancelled an unpaid checkout. No payment was collected.';
  elsif v_choice = 'full_refund' and v_is_stay and coalesce((v_refund_prep->>'ok')::boolean, false) then
    v_body :=
      'Traveler cancelled this booking. A refund has been queued with Stripe. Status updates when Stripe confirms the refund.';
  elsif v_choice = 'full_refund' then
    v_body :=
      'Traveler cancelled this booking. Status: Refund due until Stripe records a refund.';
  else
    v_body :=
      'Traveler cancelled this booking. No refund applies for this traveler-initiated cancellation.';
  end if;

  if v_closed_requests > 0 then
    v_body := v_body || ' The host cancellation request is closed because the traveler cancelled the booking.';
  end if;

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (v_booking.id, 'system', v_uid, v_body);

  return jsonb_build_object(
    'ok', true,
    'refund_choice', v_choice,
    'unpaid_checkout', not v_collected,
    'closed_host_cancel_requests', v_closed_requests,
    'auto_refund_queued', coalesce((v_refund_prep->>'ok')::boolean, false)
      and coalesce(v_refund_prep->>'skipped', 'false') <> 'true',
    'refund_instruction_id', v_refund_prep->>'id'
  );
end;
$$;

comment on function public.cancel_booking_as_traveler(uuid, text) is
  'Traveler cancels own booking. Stay full_refund queues booking_refund_instructions for execute-booking-refund. payment_status flips only via Stripe webhook.';

-- ---------------------------------------------------------------------------
-- Patch respond_cancellation_request: queue stay auto-refund on accept
-- ---------------------------------------------------------------------------
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
  v_booking_status text;
  v_ledger_id uuid;
  v_booking public.bookings%rowtype;
  v_refund_prep jsonb;
  v_is_stay boolean;
  v_body text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;

  select * into v_req from public.cancellation_requests where id = p_request_id;
  if v_req.id is null then
    return jsonb_build_object('ok', false, 'error', 'This cancellation request is not available.');
  end if;

  select l.supplier_id, b.guest_user_id, b.guest_email, lower(trim(coalesce(b.status, '')))
    into v_supplier, v_guest_user, v_guest_email, v_booking_status
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = v_req.booking_id;

  if not public.booking_traveler_owns(v_guest_user, v_guest_email) then
    return jsonb_build_object('ok', false, 'error', 'Only the traveler on this booking can respond.');
  end if;

  if v_req.status = 'accepted' then
    return jsonb_build_object('ok', true, 'id', v_req.id, 'already', true);
  end if;
  if v_req.status <> 'requested' then
    return jsonb_build_object('ok', false, 'error', 'This cancellation request is no longer open.');
  end if;

  if v_booking_status = 'cancelled' then
    update public.cancellation_requests
      set status = 'resolved', responded_at = now(), responded_by = v_uid
    where id = v_req.id and status = 'requested';
    return jsonb_build_object('ok', true, 'id', v_req.id, 'status', 'resolved', 'already_cancelled', true);
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

  perform set_config('app.bypass_booking_cancellation_guard', 'true', true);

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

  select * into v_booking from public.bookings where id = v_req.booking_id;
  v_is_stay := public.booking_is_stay_night(v_booking);
  v_refund_prep := null;
  if v_is_stay then
    v_refund_prep := public.ensure_stay_cancel_refund_instruction(
      v_req.booking_id,
      'supplier_cancel_accepted_full_refund',
      v_uid
    );
  end if;

  if v_is_stay and coalesce((v_refund_prep->>'ok')::boolean, false) then
    v_body :=
      'Traveler accepted the cancellation. This booking is cancelled. A full refund has been queued with Stripe. Status updates when Stripe confirms the refund.';
  else
    v_body :=
      'Traveler accepted the cancellation. This booking is cancelled. Status: Refund due until Stripe records a refund.';
  end if;

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (v_req.booking_id, 'system', v_uid, v_body);

  return jsonb_build_object(
    'ok', true,
    'id', v_req.id,
    'status', 'accepted',
    'ledger_id', v_ledger_id,
    'auto_refund_queued', coalesce((v_refund_prep->>'ok')::boolean, false)
      and coalesce(v_refund_prep->>'skipped', 'false') <> 'true',
    'refund_instruction_id', v_refund_prep->>'id'
  );
end;
$$;

comment on function public.respond_cancellation_request(uuid, boolean) is
  'Traveler accepts/declines host cancel. Accept always full_refund; stays queue auto-refund instruction for execute-booking-refund.';
