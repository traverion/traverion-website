-- Phase 1148: supplier ops write policies allow team via is_supplier_account_side.
-- actor_id must still be null or auth.uid() (no spoofing — Phase 1026).

drop policy if exists "Suppliers can write own booking events" on public.supplier_booking_events;
create policy "Suppliers can write own booking events"
  on public.supplier_booking_events
  for insert
  with check (
    public.is_supplier_account_side(supplier_id)
    and (actor_id is null or actor_id = auth.uid())
    and exists (
      select 1
      from public.bookings b
      join public.listings l on l.id = b.listing_id
      where b.id = supplier_booking_events.booking_id
        and l.supplier_id = supplier_booking_events.supplier_id
    )
  );

drop policy if exists "Suppliers can write own booking messages" on public.supplier_booking_messages;
create policy "Suppliers can write own booking messages"
  on public.supplier_booking_messages
  for insert
  with check (
    public.is_supplier_account_side(supplier_id)
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
  using (public.is_supplier_account_side(supplier_id))
  with check (
    public.is_supplier_account_side(supplier_id)
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

drop policy if exists "Suppliers can write own message campaigns" on public.supplier_message_campaigns;
create policy "Suppliers can write own message campaigns"
  on public.supplier_message_campaigns
  for insert
  with check (
    public.is_supplier_account_side(supplier_id)
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
  using (public.is_supplier_account_side(supplier_id))
  with check (
    public.is_supplier_account_side(supplier_id)
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

drop policy if exists "Suppliers can write own export runs" on public.supplier_export_runs;
create policy "Suppliers can write own export runs"
  on public.supplier_export_runs
  for insert
  with check (
    public.is_supplier_account_side(supplier_id)
    and (actor_id is null or actor_id = auth.uid())
  );
