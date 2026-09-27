-- Phase 1025: stop world-readable SELECT on public.listing_availability
-- for draft listings (capacity calendars were enumerable by anyone who
-- knew or guessed a listing UUID).
--
-- Original (009) policy: `using (true)`. Mirrors listing_discounts (114)
-- and listings SELECT (092): published OR owner.

drop policy if exists "Listing availability is viewable by everyone" on public.listing_availability;
create policy "Listing availability is viewable by everyone"
  on public.listing_availability for select
  using (
    exists (
      select 1
      from public.listings l
      where l.id = listing_availability.listing_id
        and (
          l.status = 'published'
          or l.supplier_id = auth.uid()
        )
    )
  );

comment on table public.listing_availability is
  'Per-date capacity overrides. RLS (115) SELECT requires parent listing published or owned by the reader — draft calendars are not world-readable.';
