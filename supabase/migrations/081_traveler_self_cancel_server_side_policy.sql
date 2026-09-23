-- Two bugs found auditing cancel_booking_as_traveler (069, last touched 072):
--
-- 1. The "free cancellation up to 24 hours before start" policy
--    (src/lib/cancellation-policy.ts travelerSelfCancelRefundChoice, shown to
--    travelers throughout the UI) was ONLY enforced client-side. This RPC
--    trusted whatever p_refund_choice the client sent for a paid booking.
--    A traveler could call the RPC directly (bypassing the UI) with
--    p_refund_choice = 'full_refund' at any time — including minutes before
--    a tour starts — and the server would honor it, reversing the supplier's
--    earnings ledger entry and posting a "Refund due" message that could
--    prompt staff to issue a Stripe refund that policy never actually owed.
--    Fixed: the server now independently recomputes the 24-hour cutoff
--    (Europe/Helsinki — the platform's current single-market timezone; no
--    other reference timezone exists anywhere else in this schema) and
--    downgrades to no_refund when the client's claim doesn't hold up,
--    exactly mirroring the trusted client logic but authoritatively.
--
-- 2. The supplier earnings-ledger reversal fired whenever the booking was
--    paid, regardless of refund_choice — so even a legitimate no_refund
--    traveler cancellation (traveler forfeits their payment, no Stripe
--    refund ever happens) stripped the supplier's booking_earnings row with
--    no offsetting entry anywhere. Money stayed captured by Traverion,
--    unrefunded to the traveler, and unpaid to the supplier, permanently.
--    Compared against the only other earnings-reversal path in this schema
--    (reverse_paid_booking_earnings, migration 070), which is service_role
--    only and fires exclusively on an actual Stripe charge.refunded event —
--    confirming a reversal should only ever accompany a real/promised
--    refund. Fixed: the ledger reversal now also requires
--    v_choice = 'full_refund'.
--
-- Verified against a scratch Postgres instance (not available for automated
-- CI in this repo - no Deno/pgTAP test infra exists here, a gap already
-- flagged in the shared tracker) with four cases: an honest far-out
-- full_refund cancel (still allowed + earnings reversed), a malicious
-- full_refund claim 2 hours before start (downgraded to no_refund, earnings
-- untouched), an unpaid checkout (unchanged, always no_refund), and an
-- honest near-start no_refund cancel (earnings correctly left intact).

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
  v_jwt_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_booking public.bookings%rowtype;
  v_supplier uuid;
  v_body text;
  v_choice text := lower(trim(coalesce(p_refund_choice, '')));
  v_pay text;
  v_collected boolean;
  v_tour_start timestamptz;
  v_within_free_window boolean;
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

  if not (
    v_booking.guest_user_id = v_uid
    or (length(v_jwt_email) > 0 and lower(trim(coalesce(v_booking.guest_email, ''))) = v_jwt_email)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Only the traveler on this booking can cancel.');
  end if;

  v_pay := lower(trim(coalesce(v_booking.payment_status, '')));
  if v_pay = 'refunded' then
    return jsonb_build_object('ok', false, 'error', 'This booking is already refunded.');
  end if;

  if lower(trim(coalesce(v_booking.status, ''))) = 'cancelled' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  v_collected := v_pay in ('paid', 'complete', 'succeeded');
  if not v_collected then
    v_choice := 'no_refund';
  end if;

  -- Authoritative server-side re-check of the "free cancellation up to 24h
  -- before start" policy (matches src/lib/cancellation-policy.ts
  -- travelerSelfCancelRefundChoice). See header note (1).
  if v_collected and v_choice = 'full_refund' and v_booking.booking_date is not null then
    v_tour_start := (v_booking.booking_date + coalesce(v_booking.start_time, time '00:00'))
      at time zone 'Europe/Helsinki';
    v_within_free_window := v_tour_start - now() > interval '24 hours';
    if not v_within_free_window then
      v_choice := 'no_refund';
    end if;
  end if;

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

  select l.supplier_id into v_supplier
  from public.listings l
  where l.id = v_booking.listing_id;

  -- Only reverse the supplier's recorded earnings when a refund is actually
  -- happening. See header note (2).
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

  if not v_collected then
    v_body :=
      'Traveler cancelled an unpaid checkout. No payment was collected.';
  elsif v_choice = 'full_refund' then
    v_body :=
      'Traveler cancelled this booking. Status: Refund due until Stripe records a refund. Traverion does not send Stripe refunds automatically.';
  else
    v_body :=
      'Traveler cancelled this booking. No refund applies for this traveler-initiated cancellation.';
  end if;

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (v_booking.id, 'system', v_uid, v_body);

  return jsonb_build_object('ok', true, 'refund_choice', v_choice, 'unpaid_checkout', not v_collected);
end;
$$;

revoke all on function public.cancel_booking_as_traveler(uuid, text) from public;
grant execute on function public.cancel_booking_as_traveler(uuid, text) to authenticated;

comment on function public.cancel_booking_as_traveler(uuid, text) is
  'Traveler self-cancel: enforces the 24h-before-start free-cancellation cutoff and unpaid-checkout no-refund rule server-side (not just client-side); paid trips reverse supplier earnings only when a refund is actually granted, and post Refund due / no-refund honesty.';
