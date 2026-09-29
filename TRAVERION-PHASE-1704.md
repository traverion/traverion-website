# TRAVERION PHASE 1704 — Stay / tour checkout auth resume

**Date:** 2026-09-29  
**SHA:** (see commit)  
**Stripe:** TEST (unchanged)

## Bug

After Pay → AuthModal sign-in on stay (and tour BookingPage) checkout, Stripe never opened. Traveler appeared signed in but checkout did not resume.

## Root cause

1. Auth gate used React `user` / a `userRef` that was overwritten every render with `userRef.current = user`.
2. `AuthModal` called `triggerAuthSuccess` (pending `onSuccess`) before React `user` updated from `onAuthStateChange`.
3. Modal close re-rendered the page → stale `user === null` wiped `userRef` → resume either re-opened auth or skipped identity / self-book with a null ref.

## Fix

- Gate checkout on `userRef`; on auth success `await getSession()`, set `userRef`, then re-enter checkout.
- Sync `userRef` only in `useEffect([user])` so modal re-renders cannot clear a just-hydrated session.
- AuthModal awaits `getSession()` before `triggerAuthSuccess` after sign-in / session signup.

## Verification

- Vitest: `checkout-auth-resume-1704.test.ts` source certs.
- Manual: anon stay Pay → sign in → Stripe Checkout TEST opens without a second Pay click.
