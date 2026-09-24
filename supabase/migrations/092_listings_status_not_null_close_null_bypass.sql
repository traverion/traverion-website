-- Phase 583: close a publish-verification and public-exposure bypass on
-- public.listings.status.
--
-- migration 003 added the column without NOT NULL:
--   alter table public.listings
--     add column if not exists status text default 'published'
--     check (status in ('draft', 'published'));
-- A CHECK constraint does not restrict NULL, so status could always be
-- explicitly set to NULL via a direct client UPDATE/INSERT (e.g.
-- supabase.from('listings').update({status: null})) even though the app's
-- own UI never does this. That NULL value:
--   1. Skipped the migration-082 publish-verification trigger entirely --
--      enforce_listing_publish_verification() only checks
--      `if new.status = 'published' ...`, and `NULL = 'published'`
--      evaluates to NULL, not TRUE, so the IF branch never runs for a
--      NULL status. An unverified supplier's brand-new listing could
--      never be blocked from effectively going live this way.
--   2. Was explicitly granted public SELECT access by the current
--      listings policy (migration 052):
--        using (status is null or status = 'published' or auth.uid() = supplier_id)
--      -- "status is null" was seemingly defensive for pre-migration-003
--      rows, but ALTER TABLE ... ADD COLUMN ... DEFAULT 'published'
--      backfills every existing row to the literal string 'published',
--      never NULL -- so this clause has no legitimate purpose today and
--      only served as an exposure bypass.
--   3. Was ALSO treated as bookable by both authoritative quote
--      functions: src/lib/booking-quote.ts's isListingBookable() (used
--      by quoteBooking/quoteStayNights, the traveler-facing price
--      display) and its Deno-mirrored equivalent in
--      supabase/functions/_shared/booking-quote.ts's quoteListingBooking
--      (the function create-booking-checkout-session actually uses to
--      compute the Stripe charge), plus a third, redundant inline check
--      in create-booking-checkout-session/index.ts itself -- all three
--      used `if (status && status !== 'published')`, so a falsy
--      empty/null status short-circuited the truthy check and skipped
--      the rejection entirely.
--
-- Net effect: any authenticated supplier account -- including one that
-- just signed up and has zero business/payout verification -- could set
-- status: null directly against the REST API and get a listing that was
-- both publicly visible and bookable, completely bypassing the same
-- publish-verification gap migration 082 already closed for the literal
-- 'published' value. Proved the application-layer half of this with a
-- live Vitest run against the current, unmodified code before making any
-- change: quoteBooking({status: null}), quoteBooking({status: ''}), and
-- quoteListingBooking({status: null | ''}) all returned ok: true.
--
-- The three application-layer call sites are fixed in this same phase
-- (src/lib/booking-quote.ts, supabase/functions/_shared/booking-quote.ts,
-- supabase/functions/create-booking-checkout-session/index.ts) to only
-- ever treat the literal string 'published' as bookable. This migration
-- closes the remaining two layers at the schema/RLS level, which also
-- makes the whole bug class structurally impossible going forward rather
-- than relying on every call site remembering to reject falsy status:
--   1. Schema: status becomes NOT NULL. Any existing NULL rows are
--      backfilled to 'draft' first -- never 'published' -- since NULL
--      should never have been treated as more trusted than an explicit
--      draft, and 'draft' is the fail-closed choice consistent with
--      migration 003's own stated rule ("draft = not visible on main
--      site; published = visible").
--   2. RLS: the listings SELECT policy no longer treats NULL as public;
--      only an explicit 'published' status (or the owning supplier) is
--      publicly readable.

update public.listings set status = 'draft' where status is null;

alter table public.listings
  alter column status set not null;

drop policy if exists "Listings readable when published or owner" on public.listings;
create policy "Listings readable when published or owner"
  on public.listings for select
  using (
    status = 'published'
    or auth.uid() = supplier_id
  );
