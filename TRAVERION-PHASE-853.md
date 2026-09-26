# TRAVERION-PHASE-853 — Tour Creation Completeness Audit

**Date:** 2026-09-27  
**Scope:** Tour / activity product creation → publish → book (not stays)  
**Method:** Code inspection of types, publish gates, guided scenes, traveler surfaces, and purchase snapshot — no invented fields.

**Primary sources:**
- `src/types/listingExtras.ts`, `src/types/tour.ts`
- `src/lib/listingPublishGate.ts`, `supabase/migrations/095_listing_publish_content_minimums.sql`
- `src/components/supplier/listing-creation/TourBasicsGuidedScenes.tsx`
- `src/components/supplier/listing-creation/TourOptionGuidedScenes.tsx`
- `src/components/supplier/listing-creation/TourScheduleWorkspace.tsx`
- `src/lib/listing-option-validation.ts`, `src/lib/listing-schedule-wizard.ts`
- `src/lib/purchase-snapshot.ts`, `supabase/functions/_shared/purchase-snapshot.ts`
- `src/components/tour-detail/TourListingSections.tsx`, `src/lib/tour-available-options.ts`

---

## 1. Field ownership table

Ownership = where the value is authored / authoritative. Traveler visibility and booking freeze called out in notes.

| Concept | LISTING | OPTION | SCHEDULE | BOOKING | Notes |
|---|---|---|---|---|---|
| **Title** | ✓ | | | snapshotted | `TourPackage.title`; wizard Basics; frozen in `purchase_snapshot.listingTitle` |
| **Subtitle** | ✓ | | | — | Required by publish gate + Basics identity scene |
| **Description / story** | ✓ | | | — | ≥100 chars (`MIN_LISTING_DESCRIPTION_LENGTH`); not snapshotted |
| **Highlights** | ✓ | | | — | Optional in Basics; traveler-visible if present (`TourListingSections`) |
| **Product type** | ✓ | | | — | `experienceKind`: tour / ticket / transportation |
| **Primary language** | ✓ | | | — | Wizard-required; **not** in `getListingPublishBlockers` |
| **Additional languages** | ✓ extras | | | — | `listingExtras.additionalLanguages`; overview lines only |
| **Destination / city / country** | ✓ | | | — | Discovery truth; city+country server-gated on publish (095) |
| **Destination label** | ✓ | | | — | Derived/custom `destination` string on persist |
| **Duration** | headline derived | ✓ source | | — | Option duration is SoT; listing duration via `listingDurationForPersist` |
| **Fulfillment (meet vs pickup)** | catalog filter | ✓ per option | | partial | Listing: `experienceStartStyle`; option: `fulfillment` + `pickupPlace` |
| **Meeting / pickup place** | denormalized copy | ✓ | | snapshotted | Persist copies **first** option → `meetingPoint`; checkout prefers option place |
| **Option note** | | ✓ `optionInfo` | | snapshotted as pickupInstructions* | *Listing persist maps first option’s `optionInfo` → `pickupInstructions` |
| **Pricing (uniform / age / private)** | startingFrom rollup | legacy path | ✓ when schedules | amount charged | Quote resolves schedule on date; `guest_breakdown` stored |
| **Capacity (min/max / spots)** | | legacy path | ✓ | occupancy vs paid+holds | `maxSpotsPerSlot` + availability overrides |
| **Weekdays** | | legacy path | ✓ | date must match | Mon–Sun boolean[7] |
| **Seasons / date range** | | legacy path | ✓ from/to | booking_date | Empty `to` = open-ended |
| **Start time** | `defaultStartTime` copy | legacy path | ✓ | `start_time` + snapshot | One time per schedule |
| **Inclusions / exclusions** | ✓ | | | — | Publish requires ≥2 includes, ≥1 exclude (client) |
| **Itinerary (structured DayPlan)** | stub on save | | | — | Auto day-1 from title/desc; real steps rare |
| **Typical flow notes** | ✓ extras | | | — | Partner can write; **not traveler-rendered** |
| **Difficulty** | ✓ | | | — | Easy/Moderate/Challenging; traveler only sees **Challenging** |
| **Venue / accessibility / min age** | ✓ extras | | | — | Optional “good to know”; partial traveler surface |
| **Schedule style hint** | ✓ extras | | | — | flexible / fixed_slots / on_request — overview copy only |
| **Photos** | ✓ hero + gallery | | | — | ≥4 total client publish gate; hero non-placeholder server (095) |
| **Cancellation** | platform standard | | | live policy text | `TRAVERION_STANDARD_CANCELLATION_POLICY`; not supplier-editable; not in purchase snapshot |
| **Drop-off** | hardcoded | | | — | Persist always `dropoffMode: 'same_as_pickup'` |
| **Private buy-out** | | / schedule | ✓ | quote | `isPrivate` + `privatePricing` |
| **Schedule readiness** | | has `schedules[]` | `draft` \| `ready` | only ready bookable | Draft schedules not bookable |

\*Legacy options without `schedules[]` still carry weekdays / seasons / price / capacity on the **option** itself; guided creation now pushes those onto schedules (`TourOptionGuidedScenes` → `TourScheduleWorkspace`).

---

## 2. What Traverion ALREADY models well

Honest strengths — these are real, wired, and used:

1. **Clear product hierarchy (listing → option → schedule)**  
   Options are variants (pickup vs meet, morning vs evening), not ticket ages. Age bands live under pricing (`ListingPriceCategory`). Schedules own seasonal windows, weekdays, departure time, price, and capacity (`ListingOptionSchedule` in `listingExtras.ts`).

2. **Guided creation with progressive readiness**  
   Basics scenes (`TourBasicsGuidedScenes`), option scenes (`TourOptionGuidedScenes`), schedule workspace (`TourScheduleWorkspace`) enforce step satisfaction before Continue; drafts vs ready schedules are explicit.

3. **Commercial quote truth at checkout**  
   `quoteListingBooking` (Deno + client lockstep) resolves schedule-for-date, age mix, private flat, weekday/season, and rejects unbookable prices. Inventory/capacity is enforced at booking — not only in UI.

4. **Client publish completeness bar for tours**  
   `getListingPublishBlockers` requires title/subtitle/description bounds, city+country, real hero + ≥3 gallery, includes/excludes, and per-option duration / meeting text / option note / ready schedule (or legacy availability). Empty blank option templates are ignored via `materializedBookingOptions`.

5. **Server publish floor for discovery honesty**  
   Migration 095 blocks draft→published without city, country, and non-placeholder hero image. Verification gate (082) is separate.

6. **Platform cancellation standard**  
   One clear 24h free-cancel policy written on every save (`TRAVERION_STANDARD_CANCELLATION_POLICY`) — avoids supplier free-text chaos. Traveler surfaces use it consistently when present.

7. **Thin but real purchase freeze**  
   Checkout stores `purchase_snapshot` (title, option label, meeting, pickup instructions, start time) so later listing edits cannot silently rewrite those trip facts.

---

## 3. What is PARTIAL

UI or schema exists, but validation, traveler visibility, or booking freeze is weak.

| Area | What exists | Gap |
|---|---|---|
| **Itinerary** | Optional “typical flow” textarea; `itinerary[]` column | `typicalTimelineNotes` is **never shown** on traveler pages (only written in `SupplierListingForm`). Persist writes a **generic DayPlan stub** from title/description, which `TourListingSections.itinerarySteps` correctly hides as duplicate — so travelers usually see **no itinerary**. |
| **Difficulty** | Partner select Easy / Moderate / Challenging | Only **Challenging** appears in “Good to know”. Easy/Moderate are invisible to travelers. |
| **Languages** | Primary required to leave Basics; extras for more codes | Publish gate does **not** require `experienceLanguage`. Languages are listing-level only — not per option/departure. |
| **Fulfillment** | Option `fulfillment` + listing `experienceStartStyle` | Two layers can disagree. Option cards show `pickupPlace` (`optionMetaParts`) but not a clear “Meeting point” vs “Pickup” label. Listing “Pickup and meeting” section uses **denormalized first-option** fields, not the selected option. |
| **Cancellation** | Standard policy + legacy preset types still parsed | Presets no longer written (`listingExtrasToDb`). Supplier cannot express longer free-cancel windows. Policy text is **not** in `purchase_snapshot`. |
| **Publish enforcement** | Strong client gate | 095 intentionally does **not** re-check options, includes, gallery count, or price. API/bypass can publish thin content if city/country/image pass. |
| **Schedule style `on_request`** | Stored + overview line | No real on-request booking path — still fixed date/slot checkout. |
| **Drop-off** | Fields on `TourPackage` | Always forced to same-as-pickup on save; no partner UI. |
| **Highlights / accessibility / min age / venue** | Editable extras | Optional; not publish blockers. Min age only if set; accessibility in overview chips. |
| **Purchase snapshot** | Title / option / meeting / pickup / start | **Not** snapshotted: duration, inclusions, cancellation, fulfillment mode, price categories, schedule id, photo set. Post-purchase listing edits can change what the trip “was” on the PDP while Trips keeps only the thin freeze. |
| **Listing duration** | Derived headline | Multi-option products with different durations collapse to the **first** option’s duration (`headlineDurationFromBookingOptions`). |

---

## 4. MISSING for a real GYG-class operator (P0 / P1 only)

Not wishlists (no reviews SEO widgets, no AI copy, no multi-currency admin, etc.).

### P0 — operators cannot safely sell at GYG depth without these

1. **Booking cut-off before departure**  
   No modeled “last bookable X hours before start.” Capacity/weekday alone is not enough: operators need to stop sales when they can no longer staff/prep. Absent across types, quote, and publish.

2. **Selected-option meeting/fulfillment truth on PDP + thicker trip freeze**  
   Operators already enter per-option place + fulfillment, but the durable listing copy and “Pickup and meeting” section lean on first-option denormalization. Expand traveler selection UI to always show meet-vs-pickup for the **chosen** option, and extend `purchase_snapshot` with fulfillment, duration, and cancellation terms so paid trips do not drift when the listing is edited.

3. **Server-side “at least one ready bookable option/schedule” on publish**  
   Client gate + quote protect money paths, but 095 admits content polish is UI-only. A verified partner (or direct REST update) can still force `published` without a ready schedule if city/country/image are set. GYG-class inventory requires a hard bookability floor at publish transition.

### P1 — needed soon for credible operator completeness

4. **Traveler-visible itinerary that matches partner input**  
   Either render `typicalTimelineNotes` as the itinerary section, or replace the DayPlan stub with a real structured editor that travelers see. Today partners can fill “Typical flow” and travelers see nothing.

5. **Consistent guest-constraint surfacing (difficulty, age, accessibility)**  
   Moderate difficulty and empty min-age feel optional in partner UI and nearly invisible on PDP. For activities, age minimum + difficulty are decision-critical — treat as first-class traveler facts (still optional to publish if product policy prefers, but if entered they must show).

---

## 5. Recommended next implementation phases (max 5)

Concrete, ordered, each shippable alone:

| Phase | Focus | Concrete outcome |
|---|---|---|
| **854** | Publish bookability hard gate | Extend server publish transition (alongside 095) to require ≥1 materialized option with ≥1 ready, priced schedule (or equivalent legacy option shape). Keep quote as money SoT; do not re-implement full client polish in SQL. |
| **855** | Option-scoped meeting on PDP | Traveler detail: selected option shows fulfillment label + place; stop relying on first-option denormalization for the main meeting section. Align snapshot resolver with the same fields. |
| **856** | Booking cut-off | Add per-option or per-schedule “latest booking hours before start”; enforce in quote + checkout; surface in partner schedule wizard + traveler “Book by …”. |
| **857** | Purchase snapshot completeness | Freeze duration, fulfillment, cancellation policy text, and charged guest mix labels into `purchase_snapshot` (backward-compatible readers). |
| **858** | Itinerary honesty | Make partner “typical flow” traveler-visible **or** delete the dead field and ship a minimal structured step list that is not auto-stubbed from description. |

---

## Audit verdict

Traverion’s tour creation stack is **stronger than a form dump**: option/schedule separation, age pricing, guided scenes, client publish blockers, and quote/inventory truth are real. It is **not yet GYG-operator-complete**: itinerary and several “good to know” fields are write-biased, publish bookability is only partially server-enforced, meeting copy can lag the selected option, cut-offs do not exist, and the purchase freeze is deliberately thin.

**Do not claim** Traverion models structured multi-day itineraries, per-option languages, supplier-custom cancellation windows, drop-off points, geo pins, or on-request confirmation workflows — those are absent or cosmetic today.
