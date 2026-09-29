# TRAVERION PHASE 1718 — Partner-only recovery session must survive traveler wipe

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

After Phase 1717 kept partner reset on www, pure partners (supplier profile, no consumer) still failed: `AuthProvider` wiped the recovery session as partner-only bleed → invalid link / `updateUser` fail.

## Fix

When `travelerUserAllowed` is false but `isPasswordRecoveryActive()`, do **not** call `clearPartnerOnlyTravelerSession`. Leave React `user` null so they are not a signed-in traveler; keep Supabase session for password update.

## Verification

- Vitest AuthContext wiring cert.
