# Traverion — Phase 1077

**Mission:** Marketplace completeness continuum after Phase 1076  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **127** (no new migration)  
**Founder parked (unchanged):** auto-refund; take-rate / commission

---

## Problem (P1)

Saving a tour schedule after changing `startTime` only warned when the **new** departure was under capacity. Sold/held guests remain on the **purchased** previous start time (Phase 1072 inventory). Partners could “move” 08:00 → 09:30 and believe seats moved, while travelers kept 08:00 and 09:30 opened at full capacity for new sales.

## Fix

- `scheduleDepartureTimeMoveWarning` — confirm when previous departure still has occupying guests
- Listing form remembers open-session start time and confirms move + under-sold together

## Certification

- AUTOMATED-TESTED: `capacity-reduction-warn.test.ts`
- Typecheck: covered with Phase 1076 `tsc`
