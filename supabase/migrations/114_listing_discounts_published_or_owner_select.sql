-- Phase 1024: stop world-readable SELECT on public.listing_discounts
-- for draft listings (promo codes + values were enumerable by anyone
-- who knew or guessed a listing UUID).
--
-- Original (002) policy: `using (true)`. Listings themselves are already
-- SELECT-gated to published OR owner (092). Discounts must match so a
-- supplier's unpublished promo codes cannot leak via PostgREST while the
-- parent listing stays private.
--
-- Public / anon: only discounts whose listing.status = 'published'.
-- Authenticated supplier: also their own listings' discounts (draft
-- partner UI needs to manage unpublished promos).

drop policy if exists "Listings discounts: public read" on public.listing_discounts;
create policy "Listings discounts: public read"
  on public.listing_discounts for select
  using (
    exists (
      select 1
      from public.listings l
      where l.id = listing_discounts.listing_id
        and (
          l.status = 'published'
          or l.supplier_id = auth.uid()
        )
    )
  );

comment on table public.listing_discounts is
  'Supplier-defined listing discounts. RLS (114) SELECT requires parent listing published or owned by the reader — draft promo codes are not world-readable.';
