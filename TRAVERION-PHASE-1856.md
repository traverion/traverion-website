# TRAVERION PHASE 1856 — ABANDONED CHECKOUT + DOUBLE PAY-NOW

**Date:** 2026-10-03  
**Branch:** `main`  
**Stripe:** TEST only  
**Starting SHA:** `c55f511` (post-1855 ending SHA record)  
**Ending SHA:** `10def6dd55314279abfb65d1b7b069f8600f72b4`  
**Working tree:** clean after ending-SHA record  
**Origin:** `main` ahead of `origin/main` (push not performed this phase)

---

## 1. EXECUTIVE RESULT

Phase 1856 closed the remaining Stripe failure-band items from 1855 with **real TEST execution**, and fixed a Pay-now resume bug discovered while proving double-session safety.

| Path | Proof | Result |
|------|-------|--------|
| Abandoned Checkout expire | booking **#47** | `checkout.session.expired` → `payment_status=failed`; no paid emails; webhook `processed` |
| Double Pay-now / superseded session | booking **#48** | Session A expired after rotate; booking stayed `pending` (stale expire ignored); Session B paid once |
| Pay-now resume on age_dependent tour | **#48** before fix | Resume returned `Add at least one participant.` — **fixed** |

**Verdict contribution:** abandoned + double Pay-now closed in TEST. Product still **B** (admin / soft-notify / auth-resume browser / supplier golden / mobile / mailbox remain).

---

## 2. ABANDONED (#47)

Created unpaid Checkout for Nov 19 · €189 (`9fb7aea5-…`), then expired via Stripe TEST API (`STRIPE_SECRET_KEY` from local `.env`; Stripe CLI default keys were expired).

| Field | After expire |
|-------|----------------|
| `booking_number` | 47 |
| `status` / `payment_status` | `pending` / `failed` |
| `amount_paid` / `paid_at` / `payment_intent_id` | null |
| `booking_payment_events` | `checkout.session.expired` (`evt_1UMYYv…`) |
| `stripe_webhook_events` | `processed` |
| `transactional_email_log` | **[]** (no confirm / new_booking) |

---

## 3. DOUBLE PAY-NOW (#48) + RESUME FIX

### Bug

`create-booking-checkout-session` on resume set `participantMix = null` (correct: do not trust client mix) but did **not** rebuild mix from frozen `guest_breakdown`. Age-dependent Hotel pickup therefore failed quote with `Add at least one participant.` — **Pay now broken** for this listing after first Checkout.

### Fix

- `participantMixFromGuestBreakdown` in `checkout-resume` (src + `_shared`)
- Resume select includes `guest_breakdown`; mix restored from column only
- Deployed: `create-booking-checkout-session`
- Tests: `checkout-resume.test.ts`, `pay-now-resume-mix-1856.test.ts` (18 pass)

### Proof

1. Created session A on #48 (Nov 20 · €189).
2. Pay-now resume → session B; A forced `expired` unpaid.
3. Booking stayed `payment_status=pending` with `checkout_session_id=B` (prior expire webhook processed without failing the hold).
4. Stripe TEST pay on **B** (`4242…`): `status=confirmed`, `payment_status=paid`, `amount_paid=189`.
5. Session A remained `expired` / `unpaid` (no second charge).
6. Emails: `booking_confirmed_paid` + supplier `new_booking` **sent** (1853 path still healthy).

Orphan-refund of a *paid* superseded session was not raced in this phase (PI is lazy until Checkout UI; product expire-before-pay closes the common double-tab unpaid case). Unit/architecture for orphan refund remains from prior phases.

---

## 4. SAFETY

- No LIVE keys used.
- No RLS weaken; no service-role in browser.
- Abandoned/failed holds do not occupy inventory (existing model).
- Superseded expire cannot flip current pending hold to failed.

---

## 5. REMAINING IN THIS BAND

| Item | Status |
|------|--------|
| Abandoned → failed + no confirm email | **CLOSED** (#47) |
| Double Pay-now / superseded session | **CLOSED** (#48) + resume fix |
| Paid orphan superseded refund (live race) | Architecture/unit only |
| Admin / soft-notify / auth-resume browser / supplier golden / mobile / mailbox | OPEN |

---

## 6. COMMANDS

```
vitest checkout-resume + pay-now-resume-mix-1856   # 18 pass
supabase functions deploy create-booking-checkout-session
stripe checkout sessions expire <cs>               # #47 abandon
Pay-now rotate + Stripe TEST 4242 on session B     # #48
```
