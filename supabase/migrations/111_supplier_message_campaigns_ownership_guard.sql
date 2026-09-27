-- Phase 1020: close a cross-supplier authorization gap in
-- public.supplier_message_campaigns (migration 019) -- the same
-- booking_ids uuid[] ownership family closed for
-- supplier_booking_messages (110).
--
-- The original (019) INSERT and UPDATE policies only checked
-- `supplier_id = auth.uid()`. Neither checked that every element of
-- `booking_ids` references a booking on a listing that supplier owns.
-- Any authenticated supplier can plant campaign metadata that falsely
-- associates them with a competitor's bookings via
-- src/data/supabase-supplier-campaigns-exports.ts (bookingIds passed
-- straight through).
--
-- Empty booking_ids ('{}') remains allowed. Non-empty arrays require
-- EVERY element to resolve to a booking whose listing.supplier_id
-- matches the row's supplier_id.
--
-- Verified against a scratch Postgres 16 instance (see supabase/tests/
-- supplier_message_campaigns_ownership_guard.test.sql).

drop policy if exists "Suppliers can write own message campaigns" on public.supplier_message_campaigns;
create policy "Suppliers can write own message campaigns"
  on public.supplier_message_campaigns
  for insert
  with check (
    supplier_id = auth.uid()
    and (
      cardinality(coalesce(booking_ids, '{}'::uuid[])) = 0
      or not exists (
        select 1
        from unnest(booking_ids) as bid
        where not exists (
          select 1
          from public.bookings b
          join public.listings l on l.id = b.listing_id
          where b.id = bid
            and l.supplier_id = supplier_message_campaigns.supplier_id
        )
      )
    )
  );

drop policy if exists "Suppliers can update own message campaigns" on public.supplier_message_campaigns;
create policy "Suppliers can update own message campaigns"
  on public.supplier_message_campaigns
  for update
  using (supplier_id = auth.uid())
  with check (
    supplier_id = auth.uid()
    and (
      cardinality(coalesce(booking_ids, '{}'::uuid[])) = 0
      or not exists (
        select 1
        from unnest(booking_ids) as bid
        where not exists (
          select 1
          from public.bookings b
          join public.listings l on l.id = b.listing_id
          where b.id = bid
            and l.supplier_id = supplier_message_campaigns.supplier_id
        )
      )
    )
  );

comment on table public.supplier_message_campaigns is
  'Supplier outbound message campaign metadata. RLS (111) requires every booking_ids element, on insert or update, to reference a booking whose listing is owned by the row''s own supplier_id (empty arrays allowed).';
