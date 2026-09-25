-- Phase 589: close a "publish eligibility" gap between the client-side
-- publish gate and what the server actually allows.
--
-- src/lib/listingPublishGate.ts's getListingPublishBlockers() is a real,
-- fairly thorough set of "is this listing actually ready to go live"
-- checks (title/description length, a real price, a real hero image, a
-- real city/country, includes/excludes, gallery count, per-option
-- schedule validity, and more) -- but it is a pure TypeScript function,
-- imported only by SupplierListingForm.tsx and SupplierListings.tsx. It
-- never runs on the server. Migration 082 already added a real
-- server-side backstop for the OTHER publish gate (business/payout
-- verification) after finding that gate was UI-only too -- but 082 only
-- checks supplier_profiles.verification_status / payout_verification_status.
-- It says nothing about the listing's own content, so a verified supplier
-- can still call supabase.from('listings').update({status:'published'})
-- directly against the REST API on a listing with none of
-- getListingPublishBlockers()'s requirements met -- no title, no
-- description, and, most consequentially for "Search/Discovery Truth":
-- no city/country (breaks location search and destination pages, which
-- already filter and display by these columns) and a hero image that is
-- still literally the app's own placeholder photo
-- (LISTING_PLACEHOLDER_IMAGE, src/lib/listingQualityScore.ts) presented
-- to travelers as if it were a real photo of the place -- exactly the
-- kind of "featured inventory without real inventory" the mission's
-- honesty constraints and this repo's own "REAL EMPTY > FAKE BUSY"
-- principle rule out.
--
-- Deliberately narrow scope: this does NOT re-implement the whole 200+
-- line client gate in SQL. Most of that gate's checks are either pure
-- UX/content polish (title/description length bounds, includes/excludes
-- counts, gallery photo counts) with no discovery or commercial-truth
-- consequence, or require parsing the same complex, nested
-- listingExtras.bookingOptions[].schedules[] JSON that
-- quoteListingBooking (booking-quote.ts, kept lockstep with its Deno
-- mirror via a dedicated sync test) already owns as the single source of
-- truth for "does this listing have a real bookable price" -- a $0/
-- missing price already cannot actually be charged, since that same
-- quote function rejects it at checkout time (see Phase 584). Re-deriving
-- price validity a third time, independently, in a raw SQL trigger would
-- risk exactly the kind of two-implementations-drift bug class this
-- mission has repeatedly found and fixed (falsy-guard / sibling-branch
-- inconsistency), for a case that is not actually exploitable for money.
--
-- This migration closes only the two checks that are (a) real production-
-- value / trust-integrity problems on their own, independent of price,
-- and (b) simple plain columns on public.listings with no JSON parsing
-- required: city+country (location discovery truth) and a non-placeholder
-- hero image (no fake-looking "real" inventory). Everything else
-- getListingPublishBlockers() checks remains a UI-layer completeness nudge,
-- same as before.
--
-- Same pattern as 082: a BEFORE INSERT OR UPDATE trigger that only gates
-- the transition INTO status='published' (insert as published, or an
-- update from a non-published status to published) -- never blocks an
-- ordinary edit to an already-published listing, so a supplier whose
-- content later becomes stale (e.g. they clear the image while editing
-- something else) is not silently un-publishable by a constraint they
-- didn't expect; that stays a client-side nudge, same as before.
--
-- Verified against a scratch Postgres 16 instance (see supabase/tests/
-- listing_publish_content_minimums.test.sql): missing city, missing
-- country, placeholder image (exact URL and the substring variant the
-- client gate also matches), and empty/null image are all rejected on
-- INSERT-as-published and on draft->published UPDATE; a fully real
-- listing (city+country+real image) publishes; an already-published
-- listing can still have an ordinary field edited even if its image was
-- since cleared (not newly blocked); a lapsed-content listing trying to
-- re-publish from a different non-published status is still blocked.
-- Composes with 082 in the expected order (both triggers fire on the
-- same INSERT/UPDATE; either can reject).

create or replace function public.enforce_listing_publish_content_minimums()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city text := trim(coalesce(new.city, ''));
  v_country text := trim(coalesce(new.country, ''));
  v_image text := trim(coalesce(new.image, ''));
  v_is_placeholder boolean;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if v_city = '' or v_country = '' then
      raise exception 'Publishing requires both a city and a country.';
    end if;

    v_is_placeholder :=
      v_image = ''
      or v_image = 'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg'
      or v_image like '%pexels.com/photos/346885%';
    if v_is_placeholder then
      raise exception 'Publishing requires a real hero photo — the placeholder image cannot go live.';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.enforce_listing_publish_content_minimums() is
  'Server-side backstop for a slice of getListingPublishBlockers (src/lib/listingPublishGate.ts): blocks a listing from transitioning into status=published without a city, a country, and a non-placeholder hero image. Deliberately does not re-check price (owned by quoteListingBooking, which already rejects unbookable prices at checkout) or the gate''s softer content-polish checks. Only gates the transition, not ongoing edits to an already-published row.';

drop trigger if exists listings_publish_content_minimums_guard on public.listings;
create trigger listings_publish_content_minimums_guard
  before insert or update on public.listings
  for each row
  execute function public.enforce_listing_publish_content_minimums();
