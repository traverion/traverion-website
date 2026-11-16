-- P9.3: LIVE Custom connected-account creation stays off until a supplier is explicitly approved.
-- Does not enable payout execution, transfers, automatic preparation, or Express migration.

insert into public.commercial_runtime_config (key, value_int, note)
values (
  'live_custom_onboarding_enabled',
  0,
  'P9.3 default OFF. 1 allows LIVE Custom connected-account creation only for supplier ids in live_custom_onboarding_allowlist. Does not enable transfers, payout execution, preparation, or Express migration.'
)
on conflict (key) do nothing;

create table if not exists public.live_custom_onboarding_allowlist (
  supplier_id uuid primary key references public.supplier_profiles (id) on delete cascade,
  approved_at timestamptz not null default now(),
  note text
);

comment on table public.live_custom_onboarding_allowlist is
  'Suppliers approved for one LIVE Custom connected account. Empty by default. Service role only.';

revoke all on table public.live_custom_onboarding_allowlist from public;
revoke all on table public.live_custom_onboarding_allowlist from anon;
revoke all on table public.live_custom_onboarding_allowlist from authenticated;
grant select, insert, update, delete on table public.live_custom_onboarding_allowlist to service_role;

alter table public.supplier_profiles
  add column if not exists connect_create_claimed_at timestamptz;

comment on column public.supplier_profiles.connect_create_claimed_at is
  'Short lock so two simultaneous payout-setup requests cannot create two connected accounts.';

create or replace function public.claim_connect_account_create(p_supplier_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_claimed timestamptz;
begin
  if p_supplier_id is null then
    return jsonb_build_object('action', 'refuse', 'reason', 'supplier_required');
  end if;

  select stripe_connected_account_id, connect_create_claimed_at
    into v_id, v_claimed
  from public.supplier_profiles
  where id = p_supplier_id
  for update;

  if not found then
    return jsonb_build_object('action', 'refuse', 'reason', 'supplier_not_found');
  end if;

  if v_id is not null and length(btrim(v_id)) > 0 then
    return jsonb_build_object('action', 'reuse', 'account_id', v_id);
  end if;

  if v_claimed is not null and v_claimed > now() - interval '2 minutes' then
    return jsonb_build_object('action', 'in_progress');
  end if;

  update public.supplier_profiles
    set connect_create_claimed_at = now()
    where id = p_supplier_id;

  return jsonb_build_object('action', 'create');
end;
$$;

revoke all on function public.claim_connect_account_create(uuid) from public;
revoke all on function public.claim_connect_account_create(uuid) from anon;
revoke all on function public.claim_connect_account_create(uuid) from authenticated;
grant execute on function public.claim_connect_account_create(uuid) to service_role;
