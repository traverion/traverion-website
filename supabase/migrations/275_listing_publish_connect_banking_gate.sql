-- Allow listing publish when Stripe Connect payouts are enabled OR legacy Traverion
-- IBAN payout verification is verified. Does not unpublish existing live listings
-- (trigger only gates transition into published).

create or replace function public.enforce_listing_publish_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_biz text;
  v_payout text;
  v_connect_payouts boolean;
  v_connect_acct text;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    select
      verification_status,
      payout_verification_status,
      coalesce(connect_payouts_enabled, false),
      stripe_connected_account_id
      into v_biz, v_payout, v_connect_payouts, v_connect_acct
    from public.supplier_profiles
    where id = new.supplier_id;

    if coalesce(v_biz, '') <> 'verified' then
      raise exception 'Publishing requires Traverion business verification.';
    end if;

    if not (
      (v_connect_payouts = true and nullif(trim(coalesce(v_connect_acct, '')), '') is not null)
      or coalesce(v_payout, '') = 'verified'
    ) then
      raise exception 'Publishing requires a verified payout bank (Traverion IBAN or Stripe Connect payouts enabled).';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.enforce_listing_publish_verification() is
  'Blocks transition into published unless business is Traverion-verified and banking is ready via legacy IBAN verification or Connect payouts_enabled. Does not restrict edits to already-published rows.';
