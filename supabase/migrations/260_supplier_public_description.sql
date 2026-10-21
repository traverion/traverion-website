-- Public supplier business description (editable even when legal identity is locked).
-- Shown to travelers on listing pages when present.

alter table public.supplier_profiles
  add column if not exists public_description text;

comment on column public.supplier_profiles.public_description is
  'Optional traveler-facing business description. Not locked by verification; suppliers may update freely.';

alter table public.supplier_profiles
  drop constraint if exists supplier_profiles_public_description_len;
alter table public.supplier_profiles
  add constraint supplier_profiles_public_description_len
  check (public_description is null or char_length(public_description) <= 800);

drop function if exists public.supplier_public_legal(uuid);

create function public.supplier_public_legal(p_id uuid)
returns table (
  display_name text,
  company_legal_name text,
  business_address text,
  business_logo_url text,
  privacy_policy_text text,
  terms_conditions_text text,
  public_description text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.display_name,
    p.company_legal_name,
    p.business_address,
    p.business_logo_url,
    p.privacy_policy_text,
    p.terms_conditions_text,
    p.public_description
  from public.supplier_profiles p
  where p.id = p_id;
$$;

revoke all on function public.supplier_public_legal(uuid) from public;
grant execute on function public.supplier_public_legal(uuid) to anon, authenticated;
