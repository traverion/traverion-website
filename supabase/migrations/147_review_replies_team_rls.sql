-- Phase 1158: review_replies INSERT/UPDATE for supplier team
-- (supplier_id on row is owner account; actor is team JWT with is_supplier_account_side).

drop policy if exists "Suppliers can insert reply for own listing's review" on public.review_replies;
create policy "Suppliers can insert reply for own listing's review"
  on public.review_replies for insert
  with check (
    public.is_supplier_account_side(supplier_id)
    and exists (
      select 1 from public.reviews r
      join public.listings l on l.id = r.listing_id
      where r.id = review_id
        and l.supplier_id = review_replies.supplier_id
    )
  );

drop policy if exists "Suppliers can update own reply" on public.review_replies;
create policy "Suppliers can update own reply"
  on public.review_replies for update
  using (public.is_supplier_account_side(review_replies.supplier_id))
  with check (
    public.is_supplier_account_side(review_replies.supplier_id)
    and exists (
      select 1 from public.reviews r
      join public.listings l on l.id = r.listing_id
      where r.id = review_replies.review_id
        and l.supplier_id = review_replies.supplier_id
    )
  );
