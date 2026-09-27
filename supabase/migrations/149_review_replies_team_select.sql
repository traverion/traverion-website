-- Phase 1196: review_replies SELECT for supplier team (draft listing replies).
-- Migration 120 used owner-only l.supplier_id = auth.uid(); team JWTs
-- need is_supplier_account_side after 147 granted team INSERT/UPDATE.

drop policy if exists "Anyone can read review replies" on public.review_replies;
create policy "Anyone can read review replies"
  on public.review_replies for select
  using (
    exists (
      select 1
      from public.reviews r
      join public.listings l on l.id = r.listing_id
      where r.id = review_replies.review_id
        and (
          l.status = 'published'
          or public.is_supplier_account_side(l.supplier_id)
          or r.user_id = auth.uid()
        )
    )
  );

comment on table public.review_replies is
  'One supplier reply per review. RLS (149) SELECT requires parent listing published, or reader is listing supplier/team / review author — draft listing replies are not world-readable.';
