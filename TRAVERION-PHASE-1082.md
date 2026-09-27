# Traverion — Phase 1082

**Mission:** Marketplace completion continuum after Phase 1081  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **128** (no new migration)

---

## Problem (P1)

Traveler `AuthProvider` restored any Supabase session on load. On localhost (shared origin/storage with partner), a **partner-only** session could appear as a traveler user without going through sign-in role gates — polluting Trips/checkout identity until explicit sign-in rejected it.

Production hosts are separate (`www` vs `partner`); this is mainly localhost cert bleed + defense in depth.

## Canonical truth

Authority = identity + role profiles. `supplier_profiles` without `consumer_profiles` is partner-only and must not drive traveler surfaces.

## Fix

- `travelerSessionIsPartnerOnly` helper  
- Traveler session restore / auth state change: clear partner-only sessions  
- Sign-in path uses the same helper  

Dedicated separate auth storage remains FOUNDER-parked.

## Certification

- AUTOMATED-TESTED: `traveler-session-authority.test.ts`  
- Typecheck: `tsc -p tsconfig.app.json --noEmit`  
- Browser/E2E: not performed  
