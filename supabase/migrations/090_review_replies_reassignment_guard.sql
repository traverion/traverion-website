-- Close a review-reply reassignment gap: the original (012) UPDATE policy
-- on public.review_replies only ever re-checked `auth.uid() = supplier_id`
-- on update -- unlike its own sibling INSERT policy on the very same
-- table, which correctly re-verifies listing ownership through review_id.
--
-- Concretely, before this migration, a supplier could take a reply they
-- already legitimately own (attached to a review on one of their own
-- listings) and UPDATE its review_id column to point at ANY OTHER review
-- in the system that does not yet have a reply -- including a review on a
-- competitor's listing -- with nothing checking that the new review_id
-- still belongs to a listing they actually own. supplier_id itself never
-- has to change for this to work, so both the USING clause (evaluated
-- against the existing, legitimately-owned row) and the original WITH
-- CHECK clause (which only re-checked supplier_id, unchanged) passed.
-- The unique index on review_id alone incidentally blocks reassigning
-- onto a review that already has a reply, but any not-yet-replied review
-- anywhere on the platform was fair game -- a supplier could plant their
-- own reply text underneath a stranger's review on a competitor's
-- listing.
--
-- Fix: require the same listing-ownership check the INSERT policy
-- already performs, applied to whatever review_id the row ends up with
-- after the update -- not just supplier_id.
--
-- Every outer (row-under-check) column reference below is explicitly
-- qualified as review_replies.<column>, per the lesson from migration 089
-- (an unqualified column that also exists on a joined table silently
-- binds to the wrong scope instead of raising an error).

drop policy if exists "Suppliers can update own reply" on public.review_replies;
create policy "Suppliers can update own reply"
  on public.review_replies for update
  using (auth.uid() = review_replies.supplier_id)
  with check (
    auth.uid() = review_replies.supplier_id
    and exists (
      select 1
      from public.reviews r
      join public.listings l on l.id = r.listing_id
      where r.id = review_replies.review_id
        and l.supplier_id = auth.uid()
    )
  );

comment on table public.review_replies is
  'One reply per review (unique on review_id), by the listing''s own supplier. RLS (090) re-verifies listing ownership through review_id on UPDATE, not just supplier_id, so an existing reply cannot be reassigned onto a review on a different supplier''s listing.';
