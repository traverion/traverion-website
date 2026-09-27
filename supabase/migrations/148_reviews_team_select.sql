-- Phase 1195: reviews SELECT for supplier team (draft listing reviews).
-- Migration 119 used owner-only l.supplier_id = auth.uid(); team JWTs
-- need is_supplier_account_side (141) so partner Reviews load draft rows.

drop policy if exists "Reviews are viewable by everyone" on public.reviews;
create policy "Reviews are viewable by everyone"
  on public.reviews for select
  using (
    exists (
      select 1
      from public.listings l
      where l.id = reviews.listing_id
        and (
          l.status = 'published'
          or public.is_supplier_account_side(l.supplier_id)
          or reviews.user_id = auth.uid()
        )
    )
  );

comment on table public.reviews is
  'Traveler reviews. RLS (148) SELECT requires parent listing published, or reader is listing supplier/team / review author — draft listing reviews are not world-readable.';
