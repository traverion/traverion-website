# TRAVERION PHASE 1855 — STRIPE DECLINE PATH + FIRST-DECLINE WEBHOOK FIX

**Date:** 2026-10-03  
**Branch:** `main`  
**Stripe:** TEST only  
**Starting SHA:** `885e85e` (post-1854)  
**Ending SHA:** `dff44e2bfabc117c69a14b4dc104e3d1caa379b6`

---

## 1. EXECUTIVE RESULT

Browser Stripe TEST decline on booking **#46** (Nov 18 · €189) exposed a real P1:

1. Stripe UI correctly showed “Your credit card was declined.”
2. `payment_intent.payment_failed` webhook was **processed**.
3. Booking stayed `payment_status=pending` with **null** `payment_intent_id` — decline never applied.

**Root cause:** `create-booking-checkout-session` clears `payment_intent_id` when opening Checkout. `staleCheckoutFailureShouldApply` with PI-only + `bookCs` set + `bookPi` null returns **false**, so the first real decline is treated as a superseded-session failure.

**Fix:** Before the stale check, retrieve the booking’s current Checkout session and, if `session.payment_intent ===` failed PI, pass that session id into `staleCheckoutFailureShouldApply` (helpers in `checkout-resume`). Superseded old-PI failures still ignore (session PI ≠ event PI).

**After deploy + second decline attempt on same session:**

| Field | Value |
|-------|--------|
| booking #46 | `status=pending`, `payment_status=failed` |
| `amount_paid` / `paid_at` | null |
| `payment_intent_id` | `pi_3UMR2WC3BaJIHpM61XWucB7o` |
| `booking_payment_events` | `payment_intent.payment_failed` |
| Confirmation / new_booking emails | **none** |
| Booking #45 paid | unchanged |

**Verdict contribution:** decline path closed with fix + TEST proof. Abandoned (30m expire) and double-Pay-now browser still only partially covered (architecture + unit tests for stale sessions).

Overall product still **B**.

---

## 2. CODE

- `supabase/functions/_shared/checkout-resume.ts` + `src/lib/checkout-resume.ts`  
  - `checkoutSessionPaymentIntentId`  
  - `eventCheckoutSessionIdForPaymentIntentFailure`
- `supabase/functions/stripe-webhook/index.ts` — correlate before stale check on `payment_intent.payment_failed`
- Tests: `checkout-resume.test.ts` (Phase 1855 case), `paid-decline-correlate-1855.test.ts`

Deployed: `stripe-webhook`.

---

## 3. SAFETY

- No LIVE keys.  
- No false paid booking / no confirmation emails on decline.  
- Stale-session ignore semantics preserved for rotated Checkout.  
- Inventory: `failed` does not occupy (existing hold model).

---

## 4. REMAINING IN THIS BAND

| Item | Status |
|------|--------|
| Declined card → `failed` + no confirm email | **CLOSED** (#46) |
| Abandoned checkout → expire / hold release | OPEN (time-based; not waited out this phase) |
| Double Pay now / superseded session browser | OPEN (unit/stale rules exist) |

---

## 5. COMMANDS

```
vitest checkout-resume + paid-decline-correlate-1855  # 17 pass
supabase functions deploy stripe-webhook              # ok
Stripe TEST decline 4000…0002 on #46                  # failed applied
```
