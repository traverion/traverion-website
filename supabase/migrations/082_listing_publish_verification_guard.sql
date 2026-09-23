-- P0 supplier-trust gap: publish eligibility (isSupplierReadyToPublishTours in
-- src/lib/supplierOnboarding.ts - business AND payout verification required)
-- was enforced ONLY client-side, by hiding/disabling the Publish button.
--
-- The listings RLS policies (migration 001) let a supplier insert or update
-- ANY column on their own row with no restriction on `status`:
--   create policy "Suppliers can update own listings" on public.listings
--     for update using (auth.uid() = supplier_id);
-- Nothing in the schema ever checked supplier_profiles.verification_status or
-- payout_verification_status before allowing status = 'published'. Any
-- authenticated supplier account - including one that just signed up and
-- never submitted business or payout details - could call
-- supabase.from('listings').update({status:'published'}) (or insert a row
-- with status:'published' outright) directly against the REST API and go
-- live on the marketplace, completely bypassing the admin verification queue
-- (AdminSupplierVerificationPanel) this session already audited and improved
-- in Phase 549. This is a trust & safety hole, not just an accounting one:
-- it lets an unvetted operator collect real bookings (Stripe TEST today,
-- but this exact gap would be serious once Stripe ever goes live).
--
-- Fixed with a trigger rather than a stricter RLS `with check`, so only the
-- actual transition into published is gated - not every subsequent edit to
-- an already-published listing (a supplier whose verification later lapses
-- can still fix a typo in a live listing; they just can't newly publish a
-- draft, or re-publish from some other status, until re-verified).
--
-- Verified against a scratch Postgres 16 instance in the cloud sandbox
-- (same approach as migration 081 - no Deno/pgTAP infra exists in this
-- repo) with 5 cases: unverified direct INSERT-as-published (blocked),
-- unverified draft->published UPDATE (blocked), verified supplier publish
-- (allowed), an ordinary field edit on an already-published listing after
-- verification later lapses (NOT blocked - confirms this doesn't newly
-- restrict normal editing), and a lapsed-verification supplier trying to
-- publish a different draft (still blocked).

create or replace function public.enforce_listing_publish_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_biz text;
  v_payout text;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    select verification_status, payout_verification_status
      into v_biz, v_payout
    from public.supplier_profiles
    where id = new.supplier_id;

    if coalesce(v_biz, '') <> 'verified' or coalesce(v_payout, '') <> 'verified' then
      raise exception 'Publishing requires Traverion business and payout verification.';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.enforce_listing_publish_verification() is
  'Server-side backstop for isSupplierReadyToPublishTours (src/lib/supplierOnboarding.ts): blocks a listing from transitioning into status=published unless the owning supplier is business- and payout-verified. Only gates the transition, not ongoing edits to an already-published row.';

drop trigger if exists listings_publish_verification_guard on public.listings;
create trigger listings_publish_verification_guard
  before insert or update on public.listings
  for each row
  execute function public.enforce_listing_publish_verification();
