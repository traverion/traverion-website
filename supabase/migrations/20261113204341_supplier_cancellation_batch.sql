-- Supplier cancellation batch.
-- Cancels only the booking ids in the submitted snapshot.
-- Does not query by date, listing, or departure, so a booking created
-- after the supplier confirms a selection cannot join the batch.
-- Each id is passed to request_supplier_cancellation. One failure does not
-- roll back the others. Replaying the same actor and idempotency key retries
-- only ids that did not succeed.

create table if not exists public.supplier_cancellation_batches (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  idempotency_key text not null,
  booking_ids uuid[] not null,
  reason_code text not null,
  reason_text text not null,
  evidence_note text,
  results jsonb,
  created_at timestamptz not null default now(),
  constraint supplier_cancellation_batches_key_len
    check (char_length(idempotency_key) between 8 and 80),
  constraint supplier_cancellation_batches_actor_key
    unique (actor_user_id, idempotency_key)
);

alter table public.supplier_cancellation_batches enable row level security;

revoke all on table public.supplier_cancellation_batches from public, anon, authenticated;

comment on table public.supplier_cancellation_batches is
  'Immutable supplier cancellation snapshots. No client policies; only request_supplier_cancellation_batch writes it.';

create or replace function public.request_supplier_cancellation_batch(
  p_booking_ids uuid[],
  p_reason_code text,
  p_reason_text text,
  p_evidence_note text,
  p_idempotency_key text,
  p_policy_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_key text := left(trim(coalesce(p_idempotency_key, '')), 80);
  v_code text := upper(trim(coalesce(p_reason_code, '')));
  v_text text := left(trim(coalesce(p_reason_text, '')), 2000);
  v_evidence text := left(trim(coalesce(p_evidence_note, '')), 2000);
  v_ids uuid[];
  v_existing_ids uuid[];
  v_existing_results jsonb;
  v_batch_id uuid;
  v_booking_id uuid;
  v_one jsonb;
  v_results jsonb := '[]'::jsonb;
  v_prior jsonb;
  v_succeeded integer := 0;
  v_failed integer := 0;
  v_snap jsonb := coalesce(p_policy_snapshot, '{}'::jsonb);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in to continue.');
  end if;
  if char_length(v_key) < 8 then
    return jsonb_build_object('ok', false, 'error', 'This cancellation needs a confirmation key.');
  end if;
  if v_code <> all (array[
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
  ]) then
    return jsonb_build_object('ok', false, 'error', 'Choose a cancellation reason.');
  end if;
  if char_length(v_text) < 12 then
    return jsonb_build_object('ok', false, 'error', 'Explain what happened (at least a short sentence).');
  end if;
  if v_code in ('FORCE_MAJEURE', 'UNSAFE_WEATHER', 'GOVERNMENT_RESTRICTION')
     and char_length(v_text) < 24 then
    return jsonb_build_object('ok', false, 'error', 'Force majeure needs a clear explanation of why the trip cannot run.');
  end if;

  select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_ids
  from (
    select distinct b.id
    from unnest(coalesce(p_booking_ids, '{}'::uuid[])) as b(id)
    where b.id is not null
  ) s;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Select at least one booking.');
  end if;
  if array_length(v_ids, 1) > 40 then
    return jsonb_build_object('ok', false, 'error', 'Cancel at most 40 bookings at a time.');
  end if;

  insert into public.supplier_cancellation_batches (
    actor_user_id,
    idempotency_key,
    booking_ids,
    reason_code,
    reason_text,
    evidence_note,
    results
  ) values (
    v_uid,
    v_key,
    v_ids,
    v_code,
    v_text,
    nullif(v_evidence, ''),
    null
  )
  on conflict (actor_user_id, idempotency_key) do nothing
  returning id into v_batch_id;

  if v_batch_id is null then
    select booking_ids, results
      into v_existing_ids, v_existing_results
    from public.supplier_cancellation_batches
    where actor_user_id = v_uid
      and idempotency_key = v_key;

    if v_existing_ids is distinct from v_ids then
      return jsonb_build_object(
        'ok', false,
        'error', 'This confirmation was already used for a different selection.'
      );
    end if;
    v_prior := coalesce(v_existing_results, '[]'::jsonb);
  else
    v_prior := '[]'::jsonb;
  end if;

  foreach v_booking_id in array v_ids loop
    v_one := null;
    select elem.value
      into v_one
    from jsonb_array_elements(coalesce(v_prior, '[]'::jsonb)) as elem
    where elem.value->>'booking_id' = v_booking_id::text
      and coalesce((elem.value->>'ok')::boolean, false) = true
    limit 1;

    if v_one is not null then
      v_one := v_one || jsonb_build_object('replayed', true);
    else
      begin
        v_one := public.request_supplier_cancellation(
          v_booking_id,
          v_code,
          v_text,
          nullif(v_evidence, ''),
          v_snap,
          0,
          'EUR'
        );
        v_one := coalesce(v_one, jsonb_build_object('ok', false, 'error', 'This booking could not be cancelled.'))
          || jsonb_build_object('booking_id', v_booking_id, 'replayed', false);
      exception
        when others then
          v_one := jsonb_build_object(
            'booking_id', v_booking_id,
            'ok', false,
            'replayed', false,
            'error', 'This booking could not be cancelled.'
          );
      end;
    end if;

    if coalesce((v_one->>'ok')::boolean, false) then
      v_succeeded := v_succeeded + 1;
    else
      v_failed := v_failed + 1;
    end if;
    v_results := v_results || jsonb_build_array(v_one);
  end loop;

  update public.supplier_cancellation_batches
    set results = v_results
    where actor_user_id = v_uid
      and idempotency_key = v_key;

  return jsonb_build_object(
    'ok', true,
    'partial', v_succeeded > 0 and v_failed > 0,
    'succeeded', v_succeeded,
    'failed', v_failed,
    'booking_count', array_length(v_ids, 1),
    'results', v_results
  );
end;
$$;

revoke all on function public.request_supplier_cancellation_batch(uuid[], text, text, text, text, jsonb) from public;
revoke all on function public.request_supplier_cancellation_batch(uuid[], text, text, text, text, jsonb) from anon;
grant execute on function public.request_supplier_cancellation_batch(uuid[], text, text, text, text, jsonb) to authenticated;

comment on function public.request_supplier_cancellation_batch(uuid[], text, text, text, text, jsonb) is
  'Cancels an explicit booking-id snapshot via request_supplier_cancellation. Partial results are per booking. Replay retries failures only.';
