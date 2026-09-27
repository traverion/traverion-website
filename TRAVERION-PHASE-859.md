# TRAVERION-PHASE-859 — Stay Creation Completeness Audit

**Date:** 2026-09-27  
**Scope:** Single-unit accommodation create → publish → book (not hotel PMS)  
**Method:** Code inspection of stay extras, publish gates, StayDetails, quote/occupancy — no invented fields.

**Primary sources:**
- `src/types/listingExtras.ts` (`StayDetails`)
- `src/lib/listingPublishGate.ts`, migrations `095` / `101` / `102`
- `src/pages/supplier/SupplierListingForm.tsx` (stay fields)
- `src/pages/StayDetails.tsx`
- `src/lib/booking-quote.ts` (`quoteStayNights`)
- Occupancy: stay date-range overlap + availability blocked nights

---

## 1. Field ownership

| Concept | LISTING | STAY extras | BOOKING | Notes |
|---|---|---|---|---|
| **Title / subtitle / description** | ✓ | | thin freeze | Same listing row as tours |
| **City / country** | ✓ | | — | Server publish 095 |
| **Property type** | | ✓ | — | Traveler-visible on StayDetails |
| **Bedrooms / beds / baths** | | ✓ | — | Shown when set |
| **Max guests** | | ✓ | quote | Client + server (101) publish |
| **Nightly price** | startingFrom rollup | ✓ source | charged | Quote nights × nightly + cleaning |
| **Min nights** | | ✓ | quote | Enforced in stay quote |
| **Check-in / check-out times** | | ✓ | ops copy | Client publish required; **server 102** |
| **Amenities** | | ✓ | — | Display list helper |
| **House rules** | | ✓ | — | Traveler-visible when set |
| **Photos** | ✓ | gallery extras | — | Same 4-photo floor as tours |
| **Cancellation** | platform standard | | live / snapshot* | *Tour snapshot thickened in 857; stay checkout should pass policy too when path shares builder |
| **Blocked / occupied nights** | availability + bookings | | occupancy | Overlap math at checkout |
| **Address / map pin** | city/country only | | — | No street address / lat-lng yet |
| **Cleaning fee** | | ✓ optional | quote | Included when > 0 |

---

## 2. What already works

1. Single-unit stay family (`inventoryFamily: 'stay'`) separated from tours.  
2. Client publish blockers for nightly, max guests, check-in/out, photos, city/country.  
3. Server bookability for nightly + maxGuests (101); check-in/out (102 this phase).  
4. Quote rejects past check-in, zero nights, over capacity, under min nights.  
5. Occupancy from confirmed/held bookings + blocked nights — not decorative.  
6. Rentals vertical remains explicitly unavailable in partner create UI.

---

## 3. PARTIAL / MISSING (P0–P1)

| Area | Gap |
|---|---|
| **Street address / coordinates** | Discovery uses city/country only; no map meet for stays. |
| **Purchase snapshot for stays** | Checkout builder is shared; stay-specific fields (nights, check-out, property type) not all frozen. |
| **Availability calendar UX** | Host can block nights; depth vs GYG/Airbnb calendar tools is thinner. |
| **Guest requirements / ID** | Lead guest name for stays only; no ID verification. |
| **Multi-unit / hotel** | Intentionally out of scope. |

---

## 4. Also shipped in Phase 859

- **Tour difficulty / accessibility honesty:** Easy and Moderate (and accessibility summary) now appear in tour Good to know when set — closes 853 P1 #5 write-bias for entered constraints.

---

## Audit verdict

Stay create→publish is **coherent for a single accommodation unit** with nightly pricing, capacity, times, photos, and occupancy. It is **not** a full Airbnb host console. Highest remaining stay risks: address/geo, thicker stay purchase freeze, and full UI E2E certification.
