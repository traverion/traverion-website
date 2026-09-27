# Traverion — Phase 1087

**Mission:** Marketplace completion continuum after Phase 1086  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** unchanged

---

## Problem (P1)

`fetchSupplierLedger` swallowed query errors as `[]`, so Income fees/adjustments could show as zero when the ledger failed to load — understating or inventing a clean balance.

## Fix

- Throw on ledger query error (`queryRowsOrThrow`).
- Isolate ledger fetch from earnings/bookings load; keep prior ledger; warn callout.

## Certification

- Typecheck: `tsc -p tsconfig.app.json --noEmit`
- Browser/E2E: not performed
