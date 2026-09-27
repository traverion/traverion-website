# Traverion — Phase 1059

**Mission:** Marketplace completeness continuum after Phase 1050  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **124** (no new migration)

---

## Problem

Pickup/meeting **place** and traveler **start instructions** were overloaded into `optionInfo` (and denormalized into `listings.pickup_instructions`). Suppliers could not express:

- Place: “Arctic City Hotel”
- Start instructions: “Wait outside the main entrance 10 minutes before pickup…”

as separate Option-level fields. Checkout froze `optionInfo` into `purchase_snapshot.pickupInstructions`, so blurb and start copy competed for one key.

## Ownership

| Concept | Owner | Snapshot key |
|---------|--------|--------------|
| Pickup vs meeting mode | Option (`fulfillment`) | `purchase_snapshot.fulfillment` |
| Pickup place / meeting point | Option (`pickupPlace`) | `purchase_snapshot.meetingPoint` |
| Traveler start instructions | Option (`travelerStartInstructions`) | `purchase_snapshot.pickupInstructions` |
| Short option blurb | Option (`optionInfo`) | not frozen as ops instructions |
| Listing `meeting_point` / `pickup_instructions` | Denormalized from first option (discovery only) | live catalog fallback only |

Pickup-vs-meeting remains on the purchasable Option.

## Fix

1. `ListingBookingOption.travelerStartInstructions` + normalize (legacy `optionInfo` promoted when dedicated field absent).
2. Supplier meeting scene: place + start-instructions fields; setup keeps “why choose this option” blurb.
3. Checkout `resolvePickupInstructionsForSnapshot` prefers `travelerStartInstructions` → legacy `optionInfo` → listing denorm.
4. PDP / partner pickup copy / quality score / denormalize use the dedicated field with legacy fallback.
5. Existing bookings keep `purchase_snapshot.pickupInstructions` — supplier edits after purchase do not rewrite Trips or confirmation content that reads the snapshot.

## Certification

- AUTOMATED-TESTED: `traveler-start-instructions.test.ts`, purchase-snapshot, pickup-completeness, tour-pickup-meeting, progression, marketplace-loop, booking-quote
- Edge function: `create-booking-checkout-session` (shared purchase-snapshot helper)
- No SQL migration (JSON extras field)
