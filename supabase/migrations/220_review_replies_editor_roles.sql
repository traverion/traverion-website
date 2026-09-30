-- Phase 1748 companion: review_replies INSERT/UPDATE require editor roles
-- so finance/viewer cannot publish public reply copy (parity with listings editors).

drop policy if exists "Suppliers can insert reply for own listing's review" on public.review_replies;
create policy "Suppliers can insert reply for own listing's review"
  on public.review_replies for insert
  with check (
    public.is_supplier_account_editor(supplier_id)
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
  using (public.is_supplier_account_editor(review_replies.supplier_id))
  with check (
    public.is_supplier_account_editor(review_replies.supplier_id)
    and exists (
      select 1 from public.reviews r
      join public.listings l on l.id = r.listing_id
      where r.id = review_replies.review_id
        and l.supplier_id = review_replies.supplier_id
    )
  );
