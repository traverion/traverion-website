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
| Auth | PARTIAL | Supabase Auth | Mitigate same-origin partner/traveler bleed |
| Traveler profile | PARTIAL | `consumer_profiles` | Country only with real migration; optional phone later |
| Supplier identity / onboarding | PARTIAL | `supplier_profiles` + verification | Browser-cert create→publish |
| Tour creation | PARTIAL | listings + `listing_extras` options/schedules | Deep field audit + UI create E2E |
| Tour options | PARTIAL | `bookingOptions[]` JSON | Cert multi-option publish/book |
| Schedules / seasons | PARTIAL | schedule JSON + availability | Overlap/DST/timezone model |
| Stay creation | PARTIAL | listings stay branch + nights | Shallower than tours; deepen + E2E |
| Rentals | MISSING | Partner “Not available yet” | Keep honest; no fake vertical |
| Packages/experiences families | MISSING / reserved | inventory families | Do not imply live catalogs |
| Search / discovery | PARTIAL | published listings only | Availability-aware search depth |
| Listing detail | PARTIAL | published listing + options | Snapshot fields at book time already stronger |
| Quote | TEST-ONLY / STRONG | Edge checkout session quoting | Keep server-authoritative |
| Checkout | TEST-ONLY / STRONG | Stripe TEST + holds | Concurrency + edge deploy parity |
| Booking snapshots | PARTIAL | `purchase_snapshot` + freezes | Snapshot policy edits impact UX |
| Booking state machine | PARTIAL | pending/confirmed/cancelled + payment_status | Document legal transitions; close NULL status |
| Inventory / concurrency | PARTIAL | `assert_checkout_inventory` + advisory lock | Slot-scoped lock; public remaining spots |
| Payments | TEST-ONLY | Stripe webhook → payment_status | Never invent paid from redirect |
| Cancellation | PARTIAL | RPCs + ledger | Traveler/supplier paths exist |
| Refunds | PARTIAL | Manual Stripe TEST; “Refund due” | Design auto-refund or ops SLA (FOUNDER if product fork) |
| Messaging | PARTIAL | `booking_messages` | No fake realtime |
| Reviews | PARTIAL→STRONG | ownership SQL guards | Eligibility after completed booking |
| Wishlist / Saved | PARTIAL | `wishlist` | Thin adversarial coverage |
| Trips | PARTIAL | `fetchMyBookings` + session guard | Continue honesty |
| Supplier Bookings / Pickup | PARTIAL | partner ops UI | Cert against demo + create flow |
| Availability ops | PARTIAL | calendar / capacity | Protect confirmed bookings on edit |
| Income / earnings | PARTIAL | `booking_earnings` | Manual payouts only — honest |
| Commission / take-rate | MISSING / unclear | No single snapshotted platform fee model | Define before LIVE |
| Payouts | NOT REQUIRED YET / MANUAL | `admin_record_supplier_payout` | No fake auto-payouts |
| Analytics | PARTIAL | real aggregates only | No fake popularity |
| Emails / notifications | PARTIAL | Edge + `transactional_email_log` | Idempotency + delivery cert |
| Timezones | PARTIAL / GAP | date-only / localYmd | Listing IANA timezone |
| Currency | PARTIAL | per-listing currencies, no FX | Keep coherent; no fake multi-FX |
| i18n | PARTIAL | en/fi strings | Not checkbox i18n platform |
| SEO | PARTIAL | titles/meta | Structured data only if truthful |
| Images / media | PARTIAL | storage bucket + listing images | Orphan cleanup / auth audit |
| RLS / security | PARTIAL→STRONG | migrations 080–099 | CI remote adversarial re-run |
| Privacy | PARTIAL | policies + RLS | Minimize PII on partner surfaces |
| Admin / support | PARTIAL | staff panels | Minimum intervention map |
| Moderation | NOT REQUIRED YET | — | Architecture note only |
| Cron / jobs | PARTIAL | hold expiry etc. | Inventory + idempotency |
| Observability | PARTIAL | structured logs | Checkout/payment trails |
| Cart multi-item | DEAD/OBSOLETE path | `cart_items`; `/cart`→Trips | Do not revive without design |
| Scroll / chrome | COMPLETE+VERIFIED | `overflow-x: clip` on roots | Phase scroll fix `32abd10` |

---

## Top ranked gaps (drives 852+)

| Rank | Pri | Gap | Phase intent |
|------|-----|-----|--------------|
| 1 | P0 | `bookings.status` nullable bypass (migration 100 ready, untracked) | Apply + commit + SQL test |
| 2 | P0 | Partner create→publish not mutating-browser-certified | Cert + fix blockers |
| 3 | P0 | Traveler book UI→Stripe TEST→Trips→partner Bookings E2E | Full tour then stay |
| 4 | P1 | Per-slot public remaining / sell-out honesty | Align public with slot inventory |
| 5 | P1 | Listing-scoped advisory lock coarseness | Narrow lock key when safe |
| 6 | P1 | Same-origin session bleed | Document + mitigate localhost |
| 7 | P1 | Manual refunds / “Refund due” limbo | Product decision vs ops honesty |
| 8 | P1 | No listing IANA timezone | Schema + cancel window math |
| 9 | P1 | Commission snapshot model | Define before LIVE |
| 10 | P1 | Rentals / packages not live | Keep UI honest |

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

**Status:** FIXED + browser-verified on Home (`32abd10`).  
**Cause:** `overflow-x: hidden` → computed `overflow-y: auto` trap on `html`/`body`/`main`.  
**Fix:** `overflow-x: clip`; retain overscroll-behavior.  
**Test:** `src/lib/traveler-document-scroll.test.ts`.

---

*Update this matrix when evidence upgrades a cell. Never promote on polish alone.*
