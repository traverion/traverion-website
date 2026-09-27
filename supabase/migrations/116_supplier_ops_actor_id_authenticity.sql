-- Phase 1026: stop authenticated suppliers from spoofing actor_id on
-- supplier ops tables (events, messages, campaigns, export_runs).
--
-- Each of these tables stores actor_id as "who performed the action".
-- INSERT/UPDATE policies historically only required
-- supplier_id = auth.uid(), so a supplier could set actor_id to any
-- other user's UUID and plant audit rows that falsely attribute actions
-- to a colleague, staff member, or competitor. Booking ownership for
-- events/messages/campaigns is already closed (109–111); this migration
-- only adds the actor_id authenticity check.
--
-- Rule: actor_id IS NULL OR actor_id = auth.uid().

-- supplier_booking_events (109 ownership + actor)
drop policy if exists "Suppliers can write own booking events" on public.supplier_booking_events;
create policy "Suppliers can write own booking events"
  on public.supplier_booking_events
  for insert
  with check (
    supplier_id = auth.uid()
    and (actor_id is null or actor_id = auth.uid())
    and exists (
      select 1
      from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id = supplier_booking_events.booking_id
        and l.supplier_id = supplier_booking_events.supplier_id
    )
  );

-- supplier_booking_messages (110 ownership + actor)
drop policy if exists "Suppliers can write own booking messages" on public.supplier_booking_messages;
create policy "Suppliers can write own booking messages"
  on public.supplier_booking_messages
  for insert
  with check (
    supplier_id = auth.uid()
    and (actor_id is null or actor_id = auth.uid())
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
            and l.supplier_id = supplier_booking_messages.supplier_id
        )
      )
    )
  );

drop policy if exists "Suppliers can update own booking messages" on public.supplier_booking_messages;
create policy "Suppliers can update own booking messages"
  on public.supplier_booking_messages
  for update
  using (supplier_id = auth.uid())
  with check (
    supplier_id = auth.uid()
    and (actor_id is null or actor_id = auth.uid())
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
            and l.supplier_id = supplier_booking_messages.supplier_id
        )
      )
    )
  );

-- supplier_message_campaigns (111 ownership + actor)
drop policy if exists "Suppliers can write own message campaigns" on public.supplier_message_campaigns;
create policy "Suppliers can write own message campaigns"
  on public.supplier_message_campaigns
  for insert
  with check (
    supplier_id = auth.uid()
    and (actor_id is null or actor_id = auth.uid())
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
    and (actor_id is null or actor_id = auth.uid())
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

-- supplier_export_runs (actor only — no booking_ids column)
drop policy if exists "Suppliers can write own export runs" on public.supplier_export_runs;
create policy "Suppliers can write own export runs"
  on public.supplier_export_runs
  for insert
  with check (
    supplier_id = auth.uid()
    and (actor_id is null or actor_id = auth.uid())
  );

comment on table public.supplier_export_runs is
  'Supplier export run metadata. RLS (116) requires actor_id null or = auth.uid() on insert.';
