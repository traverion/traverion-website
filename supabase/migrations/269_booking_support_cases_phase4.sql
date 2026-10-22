-- Phase 4 of 6: Customer protection — booking support cases, 48h no-show
-- escalation, internal payout holds (reuse booking_financial_holds).
-- Also: Phase 3 fix — shared payment_intent cannot queue duplicate cancel-refunds.

-- ---------------------------------------------------------------------------
-- Phase 3 critical fix: PI-level cancel-refund dedupe
-- ---------------------------------------------------------------------------
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
  'Phase 2+4: durable cancel refund. Skips pending_customer_choice/reschedule. Dedupes shared payment_intent across reschedule lineage.';

-- ---------------------------------------------------------------------------
-- Extend financial hold reasons for support cases
-- ---------------------------------------------------------------------------
alter table public.booking_financial_holds
  drop constraint if exists booking_financial_holds_reason_code_check;

alter table public.booking_financial_holds
  add constraint booking_financial_holds_reason_code_check
  check (reason_code in (
    'refund_investigation',
    'chargeback',
    'fraud_review',
    'verification',
    'manual_review',
    'negative_balance',
    'customer_support_case',
    'other'
  ));

create or replace function public.admin_set_booking_financial_hold(
  p_booking_id uuid,
  p_reason_code text,
  p_note text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier uuid;
  v_id uuid;
  v_reason text := lower(btrim(coalesce(p_reason_code, '')));
begin
  if v_reason not in (
    'refund_investigation', 'chargeback', 'fraud_review', 'verification',
    'manual_review', 'negative_balance', 'customer_support_case', 'other'
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_reason');
  end if;

  select l.supplier_id into v_supplier
  from public.bookings b
  join public.listings l on l.id = b.listing_id
  where b.id = p_booking_id;
  if v_supplier is null then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  -- Idempotent: reuse active hold with same reason on this booking.
  select id into v_id
  from public.booking_financial_holds
  where booking_id = p_booking_id
    and active
    and reason_code = v_reason
  order by created_at desc
  limit 1;

  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'already', true);
  end if;

  insert into public.booking_financial_holds (
    booking_id, supplier_id, reason_code, note, active, created_by
  ) values (
    p_booking_id, v_supplier, v_reason,
    nullif(btrim(coalesce(p_note, '')), ''),
    true, p_actor_id
  )
  returning id into v_id;

  insert into public.financial_audit_log (
    actor_id, action, booking_id, supplier_id, reason, after_state
  ) values (
    p_actor_id, 'financial_hold_set', p_booking_id, v_supplier, v_reason,
    jsonb_build_object('hold_id', v_id, 'note', p_note)
  );

  update public.supplier_earning_items
    set status = case when status = 'eligible' then 'pending' else status end,
        updated_at = now()
  where booking_id = p_booking_id and status = 'eligible';

  perform public.commercial_unlink_earning_from_unpaid_periods(p_booking_id);

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.admin_set_booking_financial_hold(uuid, text, text, uuid) from public;
revoke all on function public.admin_set_booking_financial_hold(uuid, text, text, uuid) from anon, authenticated;
grant execute on function public.admin_set_booking_financial_hold(uuid, text, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Support cases
-- ---------------------------------------------------------------------------
create table if not exists public.booking_support_cases (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique,
  booking_id uuid not null references public.bookings (id) on delete restrict,
  listing_id uuid not null references public.listings (id) on delete restrict,
  supplier_id uuid not null references public.supplier_profiles (id) on delete restrict,
  customer_user_id uuid references auth.users (id) on delete set null,
  customer_email text,
  reason_code text not null check (reason_code in (
    'operator_no_show',
    'not_provided',
    'operator_unresponsive',
    'refund_problem',
    'pickup_meeting',
    'not_as_described',
    'safety',
    'other'
  )),
  description text not null,
  evidence_notes text,
  status text not null default 'submitted'
    check (status in (
      'submitted',
      'under_review',
      'waiting_operator',
      'escalated',
      'resolved',
      'closed'
    )),
  priority text not null default 'normal'
    check (priority in ('normal', 'high', 'urgent')),
  reported_at timestamptz not null default now(),
  response_due_at timestamptz,
  escalated_at timestamptz,
  supplier_response text,
  supplier_responded_at timestamptz,
  supplier_responded_by uuid references auth.users (id) on delete set null,
  resolution_code text
    check (
      resolution_code is null
      or resolution_code in (
        'resolved_no_refund',
        'full_refund',
        'partial_refund',
        'escalated_further',
        'closed_duplicate'
      )
    ),
  resolution_note text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  financial_hold_id uuid references public.booking_financial_holds (id) on delete set null,
  payment_intent_id text,
  amount_paid numeric,
  currency text,
  supplier_warning boolean not null default false,
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_support_cases_description_len check (char_length(description) between 20 and 4000),
  constraint booking_support_cases_evidence_len check (evidence_notes is null or char_length(evidence_notes) <= 4000),
  constraint booking_support_cases_supplier_response_len check (supplier_response is null or char_length(supplier_response) <= 4000),
  constraint booking_support_cases_resolution_note_len check (resolution_note is null or char_length(resolution_note) <= 4000),
  constraint booking_support_cases_internal_note_len check (internal_note is null or char_length(internal_note) <= 4000)
);

create index if not exists booking_support_cases_status_idx
  on public.booking_support_cases (status, priority, reported_at desc);

create index if not exists booking_support_cases_booking_idx
  on public.booking_support_cases (booking_id, created_at desc);

create index if not exists booking_support_cases_supplier_idx
  on public.booking_support_cases (supplier_id, status, reported_at desc);

create index if not exists booking_support_cases_customer_idx
  on public.booking_support_cases (customer_user_id, created_at desc)
  where customer_user_id is not null;

create index if not exists booking_support_cases_due_idx
  on public.booking_support_cases (response_due_at)
  where status in ('submitted', 'under_review', 'waiting_operator')
    and response_due_at is not null;

-- One open case per booking + reason (duplicate protection)
create unique index if not exists booking_support_cases_open_reason_uidx
  on public.booking_support_cases (booking_id, reason_code)
  where status in ('submitted', 'under_review', 'waiting_operator', 'escalated');

create table if not exists public.booking_support_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.booking_support_cases (id) on delete cascade,
  actor_role text not null check (actor_role in ('customer', 'supplier', 'support', 'system')),
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  body text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists booking_support_case_events_case_idx
  on public.booking_support_case_events (case_id, created_at asc);

create table if not exists public.booking_support_case_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.booking_support_cases (id) on delete cascade,
  sender_role text not null check (sender_role in ('customer', 'supplier', 'support', 'system')),
  sender_user_id uuid references auth.users (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint booking_support_case_messages_body_len check (char_length(body) between 1 and 4000)
);

create index if not exists booking_support_case_messages_case_idx
  on public.booking_support_case_messages (case_id, created_at asc);

alter table public.booking_support_cases enable row level security;
alter table public.booking_support_case_events enable row level security;
alter table public.booking_support_case_messages enable row level security;

revoke all on public.booking_support_cases from anon, authenticated;
revoke all on public.booking_support_case_events from anon, authenticated;
revoke all on public.booking_support_case_messages from anon, authenticated;
grant select on public.booking_support_cases to authenticated;
grant select on public.booking_support_case_events to authenticated;
grant select on public.booking_support_case_messages to authenticated;

create policy booking_support_cases_select on public.booking_support_cases
  for select using (
    public.is_traverion_panel_admin()
    or public.is_supplier_account_side(supplier_id)
    or (
      customer_user_id is not null and customer_user_id = auth.uid()
    )
    or (
      nullif(trim(coalesce(customer_email, '')), '') is not null
      and lower(trim(customer_email)) = lower(trim(coalesce(public.jwt_verified_email(), '')))
    )
  );

create policy booking_support_case_events_select on public.booking_support_case_events
  for select using (
    exists (
      select 1 from public.booking_support_cases c
      where c.id = case_id
        and (
          public.is_traverion_panel_admin()
          or public.is_supplier_account_side(c.supplier_id)
          or (c.customer_user_id is not null and c.customer_user_id = auth.uid())
          or (
            nullif(trim(coalesce(c.customer_email, '')), '') is not null
            and lower(trim(c.customer_email)) = lower(trim(coalesce(public.jwt_verified_email(), '')))
          )
        )
    )
  );

create policy booking_support_case_messages_select on public.booking_support_case_messages
  for select using (
    exists (
      select 1 from public.booking_support_cases c
      where c.id = case_id
        and (
          public.is_traverion_panel_admin()
          or public.is_supplier_account_side(c.supplier_id)
          or (c.customer_user_id is not null and c.customer_user_id = auth.uid())
          or (
            nullif(trim(coalesce(c.customer_email, '')), '') is not null
            and lower(trim(c.customer_email)) = lower(trim(coalesce(public.jwt_verified_email(), '')))
          )
        )
    )
  );

-- Public reference helper
create or replace function public.booking_support_case_public_reference()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
begin
  loop
    candidate := 'SC-';
    for i in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (
      select 1 from public.booking_support_cases where public_reference = candidate
    );
  end loop;
  return candidate;
end;
$$;

create or replace function public.booking_support_cases_assign_reference()
returns trigger
language plpgsql
as $$
begin
  if new.public_reference is null or btrim(new.public_reference) = '' then
    new.public_reference := public.booking_support_case_public_reference();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tr_booking_support_cases_assign_reference on public.booking_support_cases;
create trigger tr_booking_support_cases_assign_reference
  before insert or update on public.booking_support_cases
  for each row execute function public.booking_support_cases_assign_reference();

create or replace function public._support_case_append_event(
  p_case_id uuid,
  p_actor_role text,
  p_actor_user_id uuid,
  p_event_type text,
  p_body text default null,
  p_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.booking_support_case_events (
    case_id, actor_role, actor_user_id, event_type, body, meta
  ) values (
    p_case_id, p_actor_role, p_actor_user_id, p_event_type,
    nullif(btrim(coalesce(p_body, '')), ''),
    coalesce(p_meta, '{}'::jsonb)
  );
end;
$$;

revoke all on function public._support_case_append_event(uuid, text, uuid, text, text, jsonb) from public;

-- Open case (traveler)
create or replace function public.open_booking_support_case(
  p_booking_id uuid,
  p_reason_code text,
  p_description text,
  p_evidence_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_supplier uuid;
  v_listing uuid;
  v_reason text := lower(trim(coalesce(p_reason_code, '')));
  v_desc text := left(trim(coalesce(p_description, '')), 4000);
  v_evidence text := left(trim(coalesce(p_evidence_notes, '')), 4000);
  v_id uuid;
  v_ref text;
  v_priority text := 'normal';
  v_due timestamptz;
  v_hold jsonb;
  v_hold_id uuid;
  v_existing uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;
  if v_reason not in (
    'operator_no_show', 'not_provided', 'operator_unresponsive', 'refund_problem',
    'pickup_meeting', 'not_as_described', 'safety', 'other'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Choose a valid reason.');
  end if;
  if char_length(v_desc) < 20 then
    return jsonb_build_object('ok', false, 'error', 'Please describe what happened (at least a short paragraph).');
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    return jsonb_build_object('ok', false, 'error', 'This booking is not available.');
  end if;
  if not public.booking_traveler_owns(v_booking.guest_user_id, v_booking.guest_email) then
    return jsonb_build_object('ok', false, 'error', 'Only the traveler on this booking can open a support case.');
  end if;

  select id into v_existing
  from public.booking_support_cases
  where booking_id = p_booking_id
    and reason_code = v_reason
    and status in ('submitted', 'under_review', 'waiting_operator', 'escalated')
  limit 1;
  if v_existing is not null then
    select public_reference into v_ref from public.booking_support_cases where id = v_existing;
    return jsonb_build_object(
      'ok', true,
      'already', true,
      'id', v_existing,
      'public_reference', v_ref
    );
  end if;

  select l.supplier_id, l.id into v_supplier, v_listing
  from public.listings l where l.id = v_booking.listing_id;
  if v_supplier is null then
    return jsonb_build_object('ok', false, 'error', 'Listing not found.');
  end if;

  if v_reason = 'safety' then
    v_priority := 'urgent';
    v_due := null; -- immediate priority; no mandatory wait
  elsif v_reason = 'operator_no_show' then
    v_priority := 'high';
    v_due := now() + interval '48 hours';
  else
    v_priority := 'normal';
    v_due := now() + interval '72 hours';
  end if;

  insert into public.booking_support_cases (
    booking_id, listing_id, supplier_id,
    customer_user_id, customer_email,
    reason_code, description, evidence_notes,
    status, priority, reported_at, response_due_at,
    payment_intent_id, amount_paid, currency
  ) values (
    v_booking.id, v_listing, v_supplier,
    coalesce(v_booking.guest_user_id, v_uid), v_booking.guest_email,
    v_reason, v_desc, nullif(v_evidence, ''),
    'waiting_operator', v_priority, now(), v_due,
    v_booking.payment_intent_id, v_booking.amount_paid, v_booking.currency
  )
  returning id, public_reference into v_id, v_ref;

  update public.bookings
    set support_flag = true
    where id = v_booking.id;

  -- Internal payout hold foundation (does NOT escrow Stripe funds).
  v_hold := public.admin_set_booking_financial_hold(
    v_booking.id,
    'customer_support_case',
    'Support case ' || v_ref || ' (' || v_reason || ')',
    v_uid
  );
  if coalesce((v_hold->>'ok')::boolean, false) then
    v_hold_id := nullif(v_hold->>'id', '')::uuid;
    update public.booking_support_cases
      set financial_hold_id = v_hold_id
      where id = v_id;
  end if;

  perform public._support_case_append_event(
    v_id, 'customer', v_uid, 'case_opened', v_desc,
    jsonb_build_object('reason_code', v_reason, 'priority', v_priority, 'hold_id', v_hold_id)
  );

  insert into public.booking_support_case_messages (case_id, sender_role, sender_user_id, body)
  values (v_id, 'system', v_uid,
    'Your support case was submitted. Traverion Support has been notified. Reference ' || v_ref || '.');

  insert into public.booking_messages (booking_id, sender_role, sender_user_id, body)
  values (
    v_booking.id, 'system', v_uid,
    'Traveler opened support case ' || v_ref || ' (' || v_reason || '). Supplier response may be requested.'
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'public_reference', v_ref,
    'status', 'waiting_operator',
    'priority', v_priority,
    'response_due_at', v_due,
    'financial_hold_id', v_hold_id,
    'hold_is_internal_only', true
  );
end;
$$;

revoke all on function public.open_booking_support_case(uuid, text, text, text) from public;
grant execute on function public.open_booking_support_case(uuid, text, text, text) to authenticated;

-- Supplier response
create or replace function public.respond_booking_support_case(
  p_case_id uuid,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_case public.booking_support_cases%rowtype;
  v_text text := left(trim(coalesce(p_response, '')), 4000);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;
  if char_length(v_text) < 12 then
    return jsonb_build_object('ok', false, 'error', 'Please provide a short explanation.');
  end if;

  select * into v_case from public.booking_support_cases where id = p_case_id for update;
  if v_case.id is null then
    return jsonb_build_object('ok', false, 'error', 'Case not found.');
  end if;
  if not public.is_listing_supplier_bookings_editor(v_case.listing_id) then
    return jsonb_build_object('ok', false, 'error', 'You can only respond on your own listings.');
  end if;
  if v_case.status in ('resolved', 'closed') then
    return jsonb_build_object('ok', false, 'error', 'This case is already closed.');
  end if;

  update public.booking_support_cases
    set
      supplier_response = v_text,
      supplier_responded_at = now(),
      supplier_responded_by = v_uid,
      status = case when status = 'escalated' then 'escalated' else 'under_review' end,
      updated_at = now()
    where id = p_case_id;

  perform public._support_case_append_event(
    p_case_id, 'supplier', v_uid, 'supplier_response', v_text, '{}'::jsonb
  );

  insert into public.booking_support_case_messages (case_id, sender_role, sender_user_id, body)
  values (p_case_id, 'supplier', v_uid, v_text);

  return jsonb_build_object('ok', true, 'id', p_case_id, 'status', 'under_review');
end;
$$;

revoke all on function public.respond_booking_support_case(uuid, text) from public;
grant execute on function public.respond_booking_support_case(uuid, text) to authenticated;

-- Admin resolve
create or replace function public.admin_resolve_booking_support_case(
  p_case_id uuid,
  p_resolution_code text,
  p_resolution_note text,
  p_actor_id uuid default null,
  p_release_hold boolean default true,
  p_supplier_warning boolean default false,
  p_partial_amount_minor bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case public.booking_support_cases%rowtype;
  v_code text := lower(trim(coalesce(p_resolution_code, '')));
  v_note text := left(trim(coalesce(p_resolution_note, '')), 4000);
  v_refund jsonb;
  v_release jsonb;
  v_actor uuid := coalesce(p_actor_id, auth.uid());
begin
  if v_actor is null and coalesce(auth.role(), '') is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if coalesce(auth.role(), '') is distinct from 'service_role'
     and not public.is_traverion_panel_admin() then
    return jsonb_build_object('ok', false, 'error', 'admin_required');
  end if;
  if v_code not in (
    'resolved_no_refund', 'full_refund', 'partial_refund', 'escalated_further', 'closed_duplicate'
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_resolution');
  end if;
  if char_length(v_note) < 3 then
    return jsonb_build_object('ok', false, 'error', 'resolution_note_required');
  end if;

  select * into v_case from public.booking_support_cases where id = p_case_id for update;
  if v_case.id is null then
    return jsonb_build_object('ok', false, 'error', 'case_not_found');
  end if;
  if v_case.status in ('resolved', 'closed') and v_code <> 'escalated_further' then
    return jsonb_build_object('ok', true, 'already', true, 'id', p_case_id);
  end if;

  if v_code = 'escalated_further' then
    update public.booking_support_cases
      set status = 'escalated',
          escalated_at = coalesce(escalated_at, now()),
          priority = case when priority = 'urgent' then priority else 'high' end,
          internal_note = coalesce(internal_note || E'\n', '') || v_note,
          supplier_warning = supplier_warning or coalesce(p_supplier_warning, false),
          updated_at = now()
      where id = p_case_id;
    perform public._support_case_append_event(
      p_case_id, 'support', v_actor, 'escalated', v_note, '{}'::jsonb
    );
    return jsonb_build_object('ok', true, 'id', p_case_id, 'status', 'escalated');
  end if;

  v_refund := null;
  if v_code = 'full_refund' then
    -- Prefer cancel-refund pipeline when booking already cancelled; else prepare instruction.
    if lower(trim(coalesce((select status from public.bookings where id = v_case.booking_id), ''))) = 'cancelled' then
      update public.bookings
        set cancellation_resolution = 'full_refund',
            refund_choice = 'full_refund'
        where id = v_case.booking_id
          and lower(trim(coalesce(cancellation_resolution, '')))
            is distinct from 'full_refund';
      v_refund := public.ensure_booking_cancel_refund_instruction(
        v_case.booking_id, 'support_case_full_refund', v_actor
      );
    else
      v_refund := public.prepare_refund_instruction(
        v_case.booking_id, 'full', null, 'support_case_full_refund:' || p_case_id::text,
        v_actor, 'support-case-full:' || p_case_id::text
      );
    end if;
  elsif v_code = 'partial_refund' then
    if p_partial_amount_minor is null or p_partial_amount_minor <= 0 then
      return jsonb_build_object('ok', false, 'error', 'partial_amount_required');
    end if;
    v_refund := public.prepare_refund_instruction(
      v_case.booking_id, 'partial', p_partial_amount_minor,
      'support_case_partial_refund:' || p_case_id::text,
      v_actor, 'support-case-partial:' || p_case_id::text || ':' || p_partial_amount_minor::text
    );
  end if;

  if p_release_hold and v_case.financial_hold_id is not null then
    v_release := public.admin_release_booking_financial_hold(
      v_case.financial_hold_id,
      'Released with case ' || v_case.public_reference || ': ' || v_code,
      v_actor
    );
  end if;

  update public.booking_support_cases
    set
      status = case when v_code = 'closed_duplicate' then 'closed' else 'resolved' end,
      resolution_code = v_code,
      resolution_note = v_note,
      resolved_at = now(),
      resolved_by = v_actor,
      supplier_warning = supplier_warning or coalesce(p_supplier_warning, false),
      updated_at = now()
    where id = p_case_id;

  perform public._support_case_append_event(
    p_case_id, 'support', v_actor, 'resolved', v_note,
    jsonb_build_object(
      'resolution_code', v_code,
      'refund', v_refund,
      'hold_release', v_release,
      'supplier_warning', coalesce(p_supplier_warning, false)
    )
  );

  insert into public.booking_support_case_messages (case_id, sender_role, sender_user_id, body)
  values (
    p_case_id, 'system', v_actor,
    'Resolution: ' || v_code || '. ' || v_note
  );

  return jsonb_build_object(
    'ok', true,
    'id', p_case_id,
    'status', case when v_code = 'closed_duplicate' then 'closed' else 'resolved' end,
    'resolution_code', v_code,
    'refund_prep', v_refund,
    'hold_release', v_release
  );
end;
$$;

revoke all on function public.admin_resolve_booking_support_case(uuid, text, text, uuid, boolean, boolean, bigint) from public;
revoke all on function public.admin_resolve_booking_support_case(uuid, text, text, uuid, boolean, boolean, bigint) from anon, authenticated;
grant execute on function public.admin_resolve_booking_support_case(uuid, text, text, uuid, boolean, boolean, bigint) to service_role;

-- 48h escalation (no auto-refund)
create or replace function public.process_overdue_booking_support_cases(
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
  v_row public.booking_support_cases%rowtype;
  v_n int := 0;
  v_ids uuid[] := array[]::uuid[];
begin
  if v_role is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'service_role_required');
  end if;

  for v_row in
    select *
    from public.booking_support_cases
    where status in ('submitted', 'under_review', 'waiting_operator')
      and response_due_at is not null
      and response_due_at <= now()
      and reason_code = 'operator_no_show'
      and supplier_responded_at is null
    order by response_due_at asc
    limit v_limit
  loop
    update public.booking_support_cases
      set status = 'escalated',
          escalated_at = now(),
          priority = 'high',
          updated_at = now()
      where id = v_row.id
        and status in ('submitted', 'under_review', 'waiting_operator');

    if found then
      v_n := v_n + 1;
      v_ids := array_append(v_ids, v_row.id);
      perform public._support_case_append_event(
        v_row.id, 'system', null, 'auto_escalated_48h',
        'No supplier response within 48 hours of the no-show report. Support review required before any refund.',
        jsonb_build_object('response_due_at', v_row.response_due_at)
      );
      insert into public.booking_support_case_messages (case_id, sender_role, sender_user_id, body)
      values (
        v_row.id, 'system', null,
        'This case was escalated automatically after 48 hours without an operator response. A Traverion specialist will review evidence before approving any refund.'
      );
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'escalated', v_n, 'case_ids', to_jsonb(v_ids));
end;
$$;

revoke all on function public.process_overdue_booking_support_cases(integer) from public;
revoke all on function public.process_overdue_booking_support_cases(integer) from anon, authenticated;
grant execute on function public.process_overdue_booking_support_cases(integer) to service_role;

comment on table public.booking_support_cases is
  'Phase 4: customer booking support cases. Financial holds are internal Traverion payout-eligibility flags — not Stripe escrow.';
