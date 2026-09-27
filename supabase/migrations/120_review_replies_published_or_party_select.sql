-- Phase 1036: stop world-readable SELECT on public.review_replies for
-- draft listings (supplier reply text was enumerable by review UUID
-- while the parent listing was unpublished).
--
-- Original (012) policy: `using (true)`. Align with reviews SELECT (119):
-- visible when parent listing is published, or reader is the listing
-- supplier, or reader is the parent review's author.

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
          or l.supplier_id = auth.uid()
          or r.user_id = auth.uid()
        )
    )
  );

comment on table public.review_replies is
  'One supplier reply per review. RLS (120) SELECT requires parent listing published, or reader is listing supplier / review author — draft listing replies are not world-readable.';
