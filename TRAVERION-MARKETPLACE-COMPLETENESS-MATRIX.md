# Traverion — Marketplace Completeness Matrix

**Mission:** Phases 851→1000+  
**Started:** 2026-09-27  
**Starting SHA:** `32abd10` (scroll fix after Phase 850 handoff `de7ec38`)  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only — LIVE blocked  
**Rule:** Code existence ≠ complete. UI honesty ≠ money automation.

## Certification labels

| Label | Meaning |
|-------|---------|
| COMPLETE+VERIFIED | End-to-end truth + tests (+ browser where required) |
| COMPLETE+NOT CERTIFIED | Appears coherent; missing adversarial/browser proof |
| PARTIAL | Real path exists; gaps remain |
| UI ONLY | Surface without backing truth |
| BACKEND ONLY | Capability without adequate operator/traveler UI |
| MISSING | Required for claimed vertical; not built |
| BROKEN | Incorrect under real use |
| DUPLICATED | Multiple conflicting authorities |
| INCONSISTENT | Same concept, different answers |
| UNSAFE | Authorization/money/inventory risk |
| DEAD/OBSOLETE | Reconstruction debris |
| NOT REQUIRED YET | Documented deferral |
| TEST-ONLY | Correct under Stripe TEST; LIVE out of scope |
| INTENTIONALLY-BLOCKED | Live money / destructive ops |

---

## Domain matrix (Phase 851 baseline)

| Domain | Status | Source of truth | Next action |
|--------|--------|-----------------|-------------|
| Auth | PARTIAL | Supabase Auth | Autofill harden 904; shared session localhost remains |
| Traveler profile | PARTIAL | consumer_profiles + autofill (904/932) | Optional prefs later |
| Supplier identity / onboarding | PARTIAL | `supplier_profiles` + verification | Browser-cert create→publish |
| Tour creation | STRONG / BROWSER | listings + options/schedules; create→LIVE→book **#41** | Field-depth gaps remain; dedicated traveler next |
| Tour options | STRONG / BROWSER | 2 options LIVE (919); select+€99 quote (921) | Optional Stripe pay second option |
| Schedules / seasons | PARTIAL→STRONG | seasons + TZ stack (931); multi-option seasons (919) | Overlap UX polish |
| Stay creation | PARTIAL→STRONG | publish gates 102; book #40 (875); depth inventory 913 | Amenities polish later |
| Rentals | NOT REQUIRED YET / HONEST | Partner “Not available to list yet” (879) | Keep honest until domain model defined |
| Packages/experiences families | MISSING / reserved | inventory families | Do not imply live catalogs |
| Search / discovery | PARTIAL→STRONG | published + date capacity; remaining includes holds (899) | Deeper availability-aware browse polish |
| Listing detail | PARTIAL | published listing + options | Snapshot fields at book time already stronger |
| Quote | TEST-ONLY / STRONG | Edge + client mirror; flat_group ≤0 after discount rejected (874) | Keep server-authoritative |
| Checkout | TEST-ONLY / STRONG | Stripe TEST + holds; allowlisted returnOrigin | Deployed return-origin fix (865) |
| Booking snapshots | STRONG / BROWSER | title + totalAmount survive edits (#41) | Cancellation policy already snapshotted |
| Booking state machine | STRONG / INTEGRATION | pending/confirmed/cancelled + payment_status NOT NULL (100 remote) | Keep SQL guard in CI |
| Inventory / concurrency | STRONG / BROWSER | Tour seats #41 + stay nights #40 restore; public remaining + holds (899/105); lock grain 902/106 | Parallel race re-cert optional |
| Payments | TEST-ONLY / STRONG | Stripe webhook → payment_status; #39 BROWSER | Never invent paid from redirect |
| Cancellation | STRONG / BROWSER | Traveler cancel; supplier request modal honesty (1007) | Auto-refund = FOUNDER |
| Refunds | PARTIAL / HONEST | Manual Stripe; Refund due #41; no-refund #40 | Auto-refund = FOUNDER if desired |
| Messaging | PARTIAL→STRONG | RLS deny (885); booking_ids ownership (110–111); supplier self-notify JWT (1033); no fake realtime (930) | Full notify party auth optional |
| Reviews | STRONG / ADVERSARIAL | paid+owned+started write (117/118/123); SELECT published-or-party (119–120) | Staff moderate UI later |
| Wishlist / Saved | STRONG / ADVERSARIAL | published-only insert (104/887); prune on unpublish (112/1021) | — |
| Trips | PARTIAL→STRONG | fetch + error≠empty (892) | Dedicated traveler session |
| Supplier Bookings / Pickup | STRONG / BROWSER | Refund due #41 + pickup excludes cancel (884) | Stay reservation pickup N/A |
| Availability ops | PARTIAL→STRONG | calendar + edit impact notices (909) | Capacity override polish later |
| Income / earnings | STRONG / BROWSER | `supplier_ledger_entries`; #40 keep / #41 reverse | Commission snapshot before LIVE |
| Commission / take-rate | NOT REQUIRED YET | Gross earnings only today (889) | Define snapshotted take-rate before LIVE |
| Payouts | NOT REQUIRED YET / MANUAL | `admin_record_supplier_payout` | No fake auto-payouts |
| Analytics | STRONG / BROWSER | paid-only aggregates (888) | Views/impressions not claimed |
| Emails / notifications | PARTIAL→STRONG | idempotency (893); cron wiring (907) | Delivery fire not re-certified |
| Timezones | STRONG / INTEGRATION | extras + snapshot + cancel + partner UI (883) | Stay-specific TZ polish |
| Currency | PARTIAL→STRONG | per-listing; no FX (912) | Keep coherent |
| i18n | PARTIAL | en/fi; blockers recorded (925) | Not checkbox i18n platform |
| SEO | PARTIAL→STRONG | sitemap build-time generate (896/1002); review schema gated (923) | Instant publish→sitemap without redeploy later |
| Images / media | PARTIAL→STRONG | folder RLS + delete GC owned images (906/1005) | Full bucket orphan sweep later |
| RLS / security | STRONG / ADVERSARIAL | traveler deny #41; listing isolation 091/910; vouchers/ops/events/messages/campaigns ownership 099/108–111 | Keep expanding adversarial suite |
| Privacy | PARTIAL→STRONG | public RPCs no PII; ops surfaces justified (922) | Keep minimizing |
| Legal / consent | STRONG / BROWSER | UI gate + server requires consent stamp on new checkout (1015) | — |
| Admin / support | PARTIAL→STRONG | staff panels + force-unpublish (107/1001–1003) | Browser-cert admin host later |
| Moderation | NOT REQUIRED YET | — | Architecture note only |
| Cron / jobs | PARTIAL→STRONG | hold expire + GH Actions reminder cron (907) | Live secret fire not claimed |
| Observability | PARTIAL | DB audit + edge error logs (914) | APM optional later |
| Cart multi-item | DEAD/OBSOLETE path | `cart_items` hardened published-only (113); `/cart`→Trips | Do not revive without design |
| Scroll / chrome | COMPLETE+VERIFIED | `overflow-x: clip` on roots; re-cert 1004 | Phase scroll fix `32abd10` |

---

## Top ranked gaps (drives 852+)

| Rank | Pri | Gap | Phase intent |
|------|-----|-----|--------------|
| 1 | P0 | `bookings.status` nullable bypass | **CLOSED** mig 100 remote (verified through 106) |
| 2 | P0 | Partner create→publish not mutating-browser-certified | **CLOSED create→LIVE→book #41 (870)** |
| 3 | P0 | Traveler book UI→Stripe TEST→Trips→partner Bookings E2E | Tour #39 + stay #40 + **new inventory #41**; dedicated traveler account next |
| 4 | P1 | Per-slot public remaining / sell-out honesty | **CLOSED 899** (mig 105) |
| 5 | P1 | Listing-scoped advisory lock coarseness | **CLOSED 902** (mig 106) |
| 6 | P1 | Same-origin session bleed | Autofill harden **904**; separate host storage later |
| 7 | P1 | Manual refunds / “Refund due” limbo | #41 proves honesty; auto-refund = FOUNDER if desired |
| 8 | P2 | Stay cancel TZ + broader zone catalog | Optional; Helsinki default covers FI |
| 9 | P1 | Commission snapshot model | FOUNDER when LIVE economics decided |
| 10 | P1 | Rentals / packages not live | Keep UI honest |
| 11 | P1 | Staff force-unpublish | **CLOSED** 107/1001–1003 |
| 12 | P2 | Sitemap stale after publish | **CLOSED** build-time regen 1002 |
| 13 | P0-family | Ops notes / events / messages / campaigns cross-supplier plant | **CLOSED** 108–111 (1017–1020) |
| 14 | P1 | Wishlist rows survive unpublish | **CLOSED** prune trigger 112 (1021) |
| 15 | P1 | Draft discounts/availability world-readable | **CLOSED** 114–115 (1024–1025) |
| 16 | P1 | Unverified / unpaid / pre-start review spam via API | **CLOSED** 117–118/123 (1029–1030/1043) |

---

## Post–Phase 1000 continuum (1001+)

Remote migrations through **123**. Ownership 108–111; wishlist/cart prune 112–113; published-or-owner SELECT 114–115/119–120; actor_id 116; reviews paid+started 117–118/123; rating forge block 122; supplier self-notify JWT 1033. FOUNDER open: `docs/FOUNDER_REQUIRED.md`.

---

## Explicitly NOT built (do not claim)

- LIVE Stripe / real charges  
- Automatic payouts / Stripe Connect  
- Fake reviews, popularity, urgency  
- Hotel PMS / multi-unit stays  
- Live rentals vertical  
- Realtime messaging presence  
- Full WCAG device-farm cert  

---

## Scroll regression (Prompt §61)

**Status:** FIXED + browser-verified on Home (`32abd10`; re-cert Phase 1004 page scroll).  
**Cause:** `overflow-x: hidden` → computed `overflow-y: auto` trap on `html`/`body`/`main`.  
**Fix:** `overflow-x: clip`; retain overscroll-behavior.  
**Test:** `src/lib/traveler-document-scroll.test.ts`.

---

*Update this matrix when evidence upgrades a cell. Never promote on polish alone.*
