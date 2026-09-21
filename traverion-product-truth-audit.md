# Traverion product truth audit

**Date:** 2026-09-21  
**HEAD at audit:** `d38ff80`  
**Branch:** `reconstruction/phase-0-audit`  
**Scope:** Phases 0–19 foundation map (code + IA + recent creation decisions)

---

## Product map

### Traveler (www)

| Surface | Route / entry | Status |
|--------|----------------|--------|
| Home | `/` → `Home.tsx` | Working — real catalog from Supabase when configured; tours+stays search family; honest empty/loading |
| Tours browse | `/packages` → `Packages.tsx` | Working — real listings; filters need band 60 audit for dead controls |
| Stays browse | `/stays` → `Stays.tsx` | Working — family filter; URL sync for stay deep links |
| Tour detail | `/tours/:id`, `/packages?tour=` | Working — options/schedules feed quote; gallery+booking rail present |
| Stay detail | `/stays/:id`, stay-details page | Working — occupancy calendar + quote; single-unit stays |
| Booking / checkout | `BookingPage.tsx` | Working — Stripe TEST; quote edge + client must stay lockstep |
| Booking confirmed | `/booking-confirmed` | Working |
| Trips | `/bookings` → `MyBookings.tsx` | Working — real bookings; status language needs band 180 polish |
| Account | `/account` | Working |
| Wishlist | `/wishlist` | Partial — real when authenticated; empty when none |
| Auth / reset | `/auth`, `/set-password`, `/email-confirmed` | Working |
| Destinations / marketing | Destination, About, Blog, legal | Partial — secondary; not marketplace-critical |
| Admin | `AdminDashboard` | Out of traveler loop |

### Supplier (partner host / `/partner`)

| Surface | Nav id | Status |
|--------|--------|--------|
| Home | `dashboard` | Partial — operational desk needs real-signal audit (band 300) |
| Create | `create` → listing wizard | Working / certifying — Tour schedules + Stay Space/Price just landed |
| Listings | `listings` | Working |
| Bookings | `bookings` (+ pickup, availability children) | Working — tour-oriented operations |
| Reservations | `reservations` | Working — stay nights; intentionally not a second app |
| Availability | `availability` | Partial — post-publish calendar; creation defines baseline |
| Inbox | `inbox` | Working if messages exist; no fake presence |
| Reviews | `reviews` | Working with real data only |
| Income | `earnings` | Partial — Stripe TEST truth; no fake payouts |
| Analytics | `performance` | Partial — only if backed by real metrics |
| Offers | `discounts` | Working when configured |
| Pickup planner | `pickup` | Partial — tour operational |
| Settings / account / help | footer | Working — verification must stay truthful |
| Onboarding | `onboarding` | Working |

---

## Domain models (canonical)

| Domain | Truth owner | Notes |
|--------|-------------|--------|
| Listing | `listings` row + `listing_extras` | Tour vs Stay via inventory family |
| Tour option | `listing_extras.bookingOptions[]` | Nested workspace Setup→Meeting→Availability&Pricing→Review |
| Tour schedule | `option.schedules[]` | Seasonal windows; quote resolves by date; overlap = dates∩weekdays∩startTime |
| Stay | `StayDetails` on listing | Single unit; Space vs Price wizard steps; availability = calendar after publish |
| Quote | client `booking-quote` + Deno `booking-quote.ts` | Must stay lockstep; schedule applies when date matches |
| Booking / payment | Stripe TEST + booking rows | Do not invent live money |
| Messages / reviews | real tables only | Empty > fake |

---

## Working

- Traveler home + catalog browse with real published inventory
- Tour/Stay detail + quote path architecture
- Partner IA (Create, Listings, Bookings/Reservations split)
- Tour creation Basics guided scenes
- Multi-schedule model + quote resolve (commits `4431424`, `6d25ecb`)
- Stay Space vs Price split
- Partner session / host routing separation

## Partial

- Tour Details step still denser than ideal (includes + location + expect on one scroll)
- Schedule creation UX new — needs manual Sep/Oct certification
- Supplier Home / Analytics / Income clarity
- Traveler search filter honesty (dead filters risk)
- Post-booking status language
- Availability operations vs creation baseline clarity
- Mobile density on creation layers

## Broken / high-risk (watch)

- Client ↔ edge quote drift if schedules change on one side only
- Draft duplication if upsert/continue regressions return
- Historical bookings vs future schedule edits (preserve purchase facts)

## Misleading / dead (audit targets)

- Any browse filter that does not change results
- Analytics/Income cards without transaction backing
- “Featured” without real inventory (Home already uses real listings — keep that)

## Duplicate concepts

- Bookings vs Reservations — intentional (tour ops vs stay nights); copy must stay clear
- `/supplier` → `/partner` redirects — fine; don’t rebuild parallel portals

## Unfinished / deferred

- Future verticals (rentals, packages-as-product) — do not build
- Live Stripe — separate mission only
- Fake hotel multi-unit stays — out of scope

---

## Priority for autonomous runway

1. **P0** Creation certification: Tour 1 option + 2 schedules (Sep/Oct); Stay apartment; persistence proof
2. **P0** Quote/schedule correctness regressions
3. **P1** Tour Details density / progression
4. **P1** Traveler discovery honesty (Home/Search empty + filters)
5. **P1** Tour/Stay detail booking clarity
6. **P1** Checkout trust + Trips clarity
7. **P2** Supplier bookings ops + availability
8. **P2** Inbox / reviews / income honesty
9. **P3** Global UI/motion/mobile/a11y polish bands

---

## Decisions locked from prior missions

- One option → many schedules (JSON, not new SQL entity)
- Stay = single apartment/unit; availability after publish
- Stripe remains TEST
- No competitor trade dress
- REAL EMPTY > FAKE BUSY
