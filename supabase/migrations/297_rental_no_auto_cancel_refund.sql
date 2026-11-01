-- Mission 06.5: Rentals must not queue automatic Stripe cancel-refunds.
-- Product policy (rental-cancellation.ts / purchase snapshot): cancellation request
-- is not a guaranteed refund; Traverion does not issue automatic rental refunds.
-- Tours/stays keep ensure_booking_cancel_refund_instruction + execute-booking-refund.
-- Inventory release on rental cancel remains (mig 287). Earnings still reverse on
-- traveler full_refund ledger row / Stripe charge.refunded → reverse_paid_booking_earnings.

create or replace function public.ensure_booking_cancel_refund_instruction(
  p_booking_id uuid,
  p_reason text default 'cancellation_full_refund',
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_key text;
  v_legacy_key text;
  v_amount_minor bigint;
  v_currency text;
  v_existing public.booking_refund_instructions%rowtype;
  v_id uuid;
  v_resolution text;
  v_pi text;
  v_sib_refunded boolean;
  v_sib_instr uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  -- Rentals: never auto-queue Stripe cancel refunds (ops/manual refund only).
  if public.booking_is_rental(v_booking) then
    return jsonb_build_object(
      'ok', false,
      'error', 'rental_no_auto_refund',
      'skipped', true
    );
  end if;

  if lower(trim(coalesce(v_booking.status, ''))) <> 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'not_cancelled');
  end if;

  if lower(trim(coalesce(v_booking.refund_choice, ''))) <> 'full_refund' then
    return jsonb_build_object('ok', false, 'error', 'no_refund_entitlement', 'skipped', true);
  end if;

  v_resolution := lower(trim(coalesce(v_booking.cancellation_resolution, '')));
  if v_resolution in ('pending_customer_choice', 'reschedule') then
    return jsonb_build_object(
      'ok', false,
      'error', 'pending_customer_choice',
      'skipped', true,
      'cancellation_resolution', v_resolution
    );
  end if;

  if lower(trim(coalesce(v_booking.payment_status, ''))) = 'refunded' then
    return jsonb_build_object('ok', true, 'already_refunded', true);
  end if;

  if lower(trim(coalesce(v_booking.payment_status, ''))) not in ('paid', 'complete', 'succeeded') then
    return jsonb_build_object('ok', false, 'error', 'not_paid');
  end if;

  v_pi := nullif(trim(coalesce(v_booking.payment_intent_id, '')), '');
  if v_pi is null then
    update public.bookings
      set
        auto_refund_status = 'failed',
        auto_refund_error = 'missing_payment_intent',
        auto_refund_updated_at = now()
      where id = p_booking_id;
    return jsonb_build_object('ok', false, 'error', 'missing_payment_intent');
  end if;

  -- Shared PaymentIntent across reschedule lineage: never queue a second cancel-refund.
  select exists (
    select 1 from public.bookings b2
    where nullif(trim(coalesce(b2.payment_intent_id, '')), '') = v_pi
      and b2.id is distinct from p_booking_id
      and lower(trim(coalesce(b2.payment_status, ''))) = 'refunded'
  ) into v_sib_refunded;
  if v_sib_refunded then
    update public.bookings
      set payment_status = 'refunded',
          auto_refund_status = coalesce(auto_refund_status, 'submitted'),
          auto_refund_updated_at = now()
      where id = p_booking_id
        and lower(trim(coalesce(payment_status, ''))) <> 'refunded';
    return jsonb_build_object('ok', true, 'already_refunded', true, 'shared_payment_intent', true);
  end if;

  select r.id into v_sib_instr
  from public.booking_refund_instructions r
  join public.bookings b2 on b2.id = r.booking_id
  where nullif(trim(coalesce(b2.payment_intent_id, '')), '') = v_pi
    and r.status in ('ready', 'processing', 'succeeded')
    and (
      r.idempotency_key like 'cancel-refund:%'
      or r.idempotency_key like 'stay-cancel-refund:%'
    )
  order by case when r.booking_id = p_booking_id then 0 else 1 end, r.created_at
  limit 1;

  if v_sib_instr is not null then
    select * into v_existing from public.booking_refund_instructions where id = v_sib_instr;
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
      'shared_payment_intent', true,
      'id', v_existing.id,
      'status', v_existing.status,
      'idempotency_key', v_existing.idempotency_key
    );
  end if;

  v_currency := upper(trim(coalesce(nullif(v_booking.currency, ''), 'EUR')));
  v_amount_minor := public.commercial_amount_to_minor(coalesce(v_booking.amount_paid, 0));
  if v_amount_minor is null or v_amount_minor <= 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing_to_refund');
  end if;

  v_key := 'cancel-refund:' || p_booking_id::text;
  v_legacy_key := 'stay-cancel-refund:' || p_booking_id::text;

  select * into v_existing
  from public.booking_refund_instructions
  where idempotency_key in (v_key, v_legacy_key)
  order by case when idempotency_key = v_key then 0 else 1 end
  limit 1;

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
      'idempotency_key', v_existing.idempotency_key,
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
    'Cancellation auto-refund (tour or stay) — execute via execute-booking-refund.'
  )
  returning id into v_id;

  update public.bookings
    set
      auto_refund_status = 'queued',
      auto_refund_error = null,
      auto_refund_updated_at = now(),
      cancellation_resolution = coalesce(nullif(cancellation_resolution, ''), 'full_refund')
    where id = p_booking_id;

  insert into public.financial_audit_log (
    actor_id, action, booking_id, amount_minor, currency, reason, after_state
  ) values (
    p_actor_id,
    'ensure_booking_cancel_refund_instruction',
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

comment on function public.ensure_booking_cancel_refund_instruction(uuid, text, uuid) is
  'Phase 2+4+06.5: durable cancel refund for tours/stays only. Rentals skipped (rental_no_auto_refund). Dedupes shared payment_intent across reschedule lineage.';
