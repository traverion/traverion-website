# 13 — Launch Certification Sprint 01

**Date:** 2026-10-22  
**Scope:** Payment safety, inventory integrity, Request-to-Book contracts, cancel/refund honesty  
**Mode:** Stripe **TEST only** — LIVE remains disabled  
**Commit context:** Certification contracts + LB-011 fix; no LIVE enablement  

---

## Executive result

| Layer | Outcome |
|-------|---------|
| Contract / unit certification pack | **PASS** — 103 tests / 17 files green |
| LIVE Stripe block (T10) | **PASS** (code + unit) |
| Browser + Stripe Dashboard E2E (T1–T9 runtime) | **BLOCKED** — missing authenticated TEST traveler/supplier sessions + edge secret invocation from this agent session |
| LIVE payments | **Still disabled** (intentional; verified) |

**Success condition status:** Booking/payment **architecture** is demonstrably consistent under contract tests; **full Stripe TEST journey proof** still requires founder-executed E2E below. Remaining gaps are explicit.

---

## Environment probes (no secrets printed)

| Check | Result |
|-------|--------|
| `.env` / `.env.local` Stripe publishable | `pk_test_…` present (**TEST**) |
| LIVE publishable (`pk_live_`) | Not present in local env files probed |
| Supabase URL configured | Yes (`*.supabase.co`) |
| Edge `STRIPE_SECRET_KEY` readable from agent | **No** (correct — secrets not in Vite; not fetched) |
| Partner/admin test login credentials | **Not used** this sprint |

---

## T1–T10 matrix

| ID | Path | Result | Evidence |
|----|------|--------|----------|
| **T1** | Tour Instant Book pay → paid booking + earnings | **BLOCKED** (runtime) · **PASS** (contracts) | Promote path + `quote.totalAmount` + `record_paid_booking_earnings` asserted in `launch-certification-sprint-01.cert.test.ts`; no live Checkout session created this sprint |
| **T2** | Stay Instant Book — nights blocked only after paid | **PASS** (contracts) · **BLOCKED** (runtime) | `booking-hold` + `stay-checkout-concurrency.cert` + mig 257: Instant pending does **not** occupy |
| **T3** | Two Instant Book same nights — one wins, loser refunded | **PASS** (contracts) · **BLOCKED** (runtime) | Concurrency cert: open pending may proceed until pay; paid blocks; promote conflict → auto-refund (code) |
| **T4** | Stay R2B authorize occupies + pending host | **PASS** (contracts) · **BLOCKED** (runtime) | Authorized occupies; promote authorize path + notify keys present |
| **T5** | R2B accept → capture → paid + earnings | **PASS** (contracts) · **BLOCKED** (runtime) | `stay-booking-request-action` accept + `paymentIntents.capture` + `capture_stay_booking_request` |
| **T6** | R2B decline → PI cancel + nights free | **PASS** (contracts) · **BLOCKED** (runtime) | decline/withdraw + `release_stay_booking_request` + `paymentIntents.cancel` |
| **T7** | R2B expire via scheduled job | **PASS** (contracts) · **BLOCKED** (runtime cron) | Edge `expire-stay-booking-requests` + `.github/workflows/expire-stay-booking-requests.yml` present; production Action run **NOT VERIFIED** |
| **T8** | Traveler cancel paid → Refund due; manual Stripe refund | **PASS** (honesty contracts) · **BLOCKED** (runtime refund) | Mig 256 “does not send Stripe refunds automatically”; `REFUND_DUE_MANUAL_COPY`; admin edge has **no** `stripe.refunds.create`; prepared instructions `executes_stripe: false` |
| **T9** | Webhook replay — no double earnings | **PASS** (contracts) · **BLOCKED** (runtime) | `stripe_webhook_events` insert-before-process; replay helper tests green |
| **T10** | LIVE key blocked | **PASS** | `isStripeTestSecretKey` false for `sk_live_`; checkout/webhook/reconcile/R2B action all call LIVE block; local env is `pk_test_` only |

### Interrupted checkout / recovery (related)

| Case | Result | Notes |
|------|--------|-------|
| Unpaid session expiry | **PASS** (contracts) | `expire-booking-checkout` + hold TTL helpers covered in hold tests |
| Traveler return reconcile | **PASS** (contracts) | `reconcile-checkout-session` exists; LIVE-blocked; promote short-circuit |
| Orphan / conflict auto-refund | **PASS** (contracts) | `orphan-checkout-refund` + promote conflict paths unit-tested |
| Failed payment ≠ paid | **PASS** | `admin-booking-ops` + payment-states tests |

---

## Workstream summaries

### 1. Stripe TEST certification
- **Executed:** Contract pack proving server quote (`const totalAmount = quote.totalAmount`), promote gates, webhook lock, LIVE refusal.  
- **Not executed:** Real Checkout Session with card `4242…`, webhook delivery from Stripe, Trips UI paid state.  
- **Claim discipline:** No PASS for end-to-end payment without Dashboard/browser evidence.

### 2. Inventory integrity
- **PASS (unit/cert):** Instant Book pending non-occupy; paid/authorized occupy; overlap helpers; multi-departure inventory cert file green.  
- **BLOCKED (runtime):** Two-browser same-night / same-departure race against live edge + Stripe.

### 3. Request-to-Book
- **PASS (code contracts):** accept/decline/withdraw/expire wiring + authorized cancel → withdraw.  
- **BLOCKED (runtime):** Host accept/capture, decline, and cron expiry against real PI.

### 4. Cancellation and refunds
- **Documented actual behavior (CONFIRMED by code + tests):**
  1. Unpaid cancel → expire checkout session path.  
  2. Paid cancel → booking cancelled + `refund_choice`; UI **Refund due**; **Traverion does not auto-refund on Stripe**.  
  3. Authorized R2B → traveler must **withdraw** (cancel RPC rejected).  
  4. Ops: Stripe Dashboard TEST refund (or future worker) → `charge.refunded` webhook syncs ledger.  
  5. Admin may **prepare** refund instruction; must **not** call `stripe.refunds.create` in admin edge.  
- **Availability release:** cancel/release RPCs intended to free inventory — **runtime NOT VERIFIED** this sprint.  
- **Earnings:** reverse/shrink on refund webhook — contract presence verified; live refund drill **BLOCKED**.

### 5. Fixes implemented

| ID | Defect | Fix |
|----|--------|-----|
| LB-011 | `commercial-money-engine-v1.test.ts` expected “Eligible for next payout” | Updated contract to honest manual-payout copy (`PARTNER_MONEY_PAYOUT_STATUS_NOTE`); forbids “Eligible for next payout” |
| Sprint gap | No single T-matrix regression file | Added `src/lib/launch-certification-sprint-01.cert.test.ts` (16 tests) |

**No speculative booking/payment architecture changes. LIVE remains disabled.**

---

## Regression coverage (commands)

```bash
npx vitest run \
  src/lib/launch-certification-sprint-01.cert.test.ts \
  src/lib/commercial-money-engine-v1.test.ts \
  src/lib/booking-hold.test.ts \
  src/lib/stripe-webhook-replay.test.ts \
  src/lib/stripe-test-only.test.ts \
  src/lib/stay-checkout-concurrency.cert.test.ts \
  src/lib/stay-instant-book-no-hold.cert.test.ts \
  src/lib/checkout-inventory-concurrency.cert.test.ts \
  src/lib/stay-webhook-idempotency.cert.test.ts \
  src/lib/multi-departure-inventory.cert.test.ts \
  src/lib/promote-paid-checkout.test.ts \
  src/lib/orphan-checkout-refund.test.ts \
  src/lib/stay-request-approval.test.ts \
  src/lib/admin-booking-ops.test.ts \
  src/lib/financial-recovery-engine.test.ts \
  src/lib/payment-states.test.ts \
  src/data/stay-authorized-cancel-route.test.ts
```

**Result (2026-10-22):** `Test Files  17 passed (17)` · `Tests  103 passed (103)`

---

## Confirmed defects / non-defects

| Item | Classification |
|------|----------------|
| LIVE blocked | **Not a defect** — safety requirement; T10 PASS |
| Cancel ≠ auto Stripe refund | **Confirmed product behavior** — document for ops; not “fixed” into auto-refund this sprint |
| R2B / Instant Book E2E unproven in this session | **Gap** — BLOCKED pending founder TEST |
| Earnings “Eligible for next payout” | **Fixed** — dishonest copy no longer required by tests; UI already honest |

---

## Remaining launch blockers (after this sprint)

Still open from `09-LAUNCH-BLOCKERS.md` (updated meaning):

| ID | Status after Sprint 01 |
|----|------------------------|
| LB-001 LIVE disabled | **PASS as safety** — keep until LIVE program |
| LB-002 Manual refunds | **CONFIRMED** — ops playbook required |
| LB-003 Email delivery | **Still NOT VERIFIED** |
| LB-004 R2B runtime | **Still BLOCKED** for E2E |
| LB-005 Concurrency runtime | **Still BLOCKED** for E2E |
| LB-006 Admin wipe | **Still NOT VERIFIED** runtime |
| LB-007 Commercial take-rate | **Open** (policy) |
| LB-008 Cron prod | **Still NOT VERIFIED** |
| LB-009 Supplier golden path | **Still NOT VERIFIED** |
| LB-010 Legal | **Owner** |
| LB-011 Money UI drift | **FIXED** (test aligned to honest copy) |

---

## Exact manual actions required from the founder

### A. Stripe TEST E2E (clears T1–T6, T8–T9 runtime)

1. Confirm Supabase Edge secrets use **`sk_test_…`** and **`whsec_…`** for TEST webhook (never `sk_live_`).  
2. Use Stripe TEST card `4242 4242 4242 4242` only.  
3. **T1:** Traveler books a published tour → complete Checkout → confirm Trips = paid, supplier bookings = paid, Money ledger row exists.  
4. **T2:** Stay Instant Book → calendar must allow parallel opens until pay; after pay, nights blocked.  
5. **T3:** Two browsers, same stay nights → first paid wins; second promote path refunds (check Stripe + booking states).  
6. **T4–T6:** Stay with `bookingMethod=request` → authorize → host Accept / Decline / traveler Withdraw.  
7. **T8:** Cancel a paid booking with full_refund policy → UI Refund due → refund in Stripe Dashboard TEST → confirm webhook updates payment_status/ledger.  
8. **T9:** Replay a processed webhook event in Stripe (or redeliver) → no duplicate earnings/emails.  
9. Capture screenshots + booking public references in a private note (do not commit PII).

### B. R2B expiry (T7)

1. GitHub → Actions → `expire-stay-booking-requests` → verify recent green runs.  
2. Or manually `POST` the edge function with service role in a private terminal (do not paste secrets into chat/git).  
3. Create an authorized request with short `approval_expires_at` in TEST DB only if you have a safe staging project.

### C. Email (LB-003)

1. After T1, check traveler + supplier mailboxes / Resend dashboard.  
2. Mark PASS only with delivery proof.

### D. Do not

- Enable LIVE keys  
- Run real charges/refunds outside TEST  
- Treat this document’s contract PASS as LIVE readiness  

---

## Files touched this sprint

| File | Change |
|------|--------|
| `src/lib/commercial-money-engine-v1.test.ts` | Align to honest payout copy (LB-011) |
| `src/lib/launch-certification-sprint-01.cert.test.ts` | **New** T-matrix contract suite |
| `docs/audits/traverion-platform-audit/13-LAUNCH-CERTIFICATION-SPRINT-01.md` | This report |

---

## Bottom line

- **Reliable in the sense of code safety:** YES for TEST-mode guards, inventory occupy rules, R2B wiring, refund honesty, webhook lock.  
- **Reliable as a fully exercised Stripe TEST marketplace:** NOT YET — founder must run section A–C.  
- **LIVE payments:** remain **disabled**.  
