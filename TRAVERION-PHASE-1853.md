# TRAVERION PHASE 1853 — CLOSE SUCCESSFUL-PAYMENT TRANSACTIONAL EMAILS

**Date:** 2026-10-03  
**Branch:** `main`  
**Stripe:** TEST only (LIVE not enabled)  
**Starting SHA:** `b9714163d19410e0cbe896e3f1b60504292d891e` (post-1852 ending SHA record)  
**Ending SHA:** *(recorded after commit)*  
**Working tree:** clean after phase commit  
**Origin:** push not performed this phase unless requested

---

## 1. EXECUTIVE RESULT

Phase 1853 closed the clearest remaining P1 from booking #44: successful Stripe TEST payment promoted the booking/ledger correctly but **never** wrote `booking_confirmed_paid` or supplier `new_booking` to `transactional_email_log`.

**Root cause:** `notifyPaidBookingSideEffects` invoked notify edge functions with `Authorization: Bearer <service_role>` but `apikey: <anon>`. Supabase gateway rejects that as **Conflicting API keys** (401). The refund webhook path already used matching service-role headers and worked — which is why cancel/refund emails appeared for #44 while paid confirms did not.

**Fix:** shared `serviceRoleEdgeInvokeHeaders(serviceRoleKey)` (matching Bearer + apikey). Deployed via `stripe-webhook` + `reconcile-checkout-session`.

**Proof booking #45** (Stripe TEST, Nov 17 2026, €189):

| Channel | Idempotency key | Recipient | Status | Provider message id |
|---------|-----------------|-----------|--------|---------------------|
| customer | `customer:booking_confirmed_paid:1caf0cd7-…` | `mirov.vesterinen@gmail.com` | `sent` | `01a10175-59e2-…` |
| supplier | `supplier:new_booking:1caf0cd7-…` | `contact@royalnordic.fi` + owner + viewer team | `sent` | `01a10175-4eb2-…` |

Booking #44 still has **zero** paid-confirm log rows (historical gap; not backfilled — correct, money path already settled).

**Verdict: B. READY FOR LIMITED TEST USERS, NOT LIVE MONEY** (paid-email P1 closed; other certification gaps remain).

---

## 2. HYPOTHESIS → ROOT CAUSE

| Hypothesis | Result |
|------------|--------|
| Notify never called after promote | Rejected — code path exists at promote success |
| Guest email missing | Rejected — #44/#45 had traveler email |
| Resend failure swallowed | Rejected — no log rows at all (claim never reached) |
| Service-role JWT vs CLI key mismatch blocks webhook | Partial — explains external CLI 401; **not** the #44 bug |
| **Conflicting apikey (anon) + service Bearer** | **CONFIRMED** — matches refund-path parity; fixed |

---

## 3. CODE CHANGE

File: `supabase/functions/_shared/promote-paid-from-checkout.ts`

- Export `serviceRoleEdgeInvokeHeaders(serviceRoleKey)`.
- `notifyPaidBookingSideEffects` uses it for both `notify-supplier-event` and `notify-customer-booking`.
- Explicit idempotency keys: `supplier:new_booking:${bookingId}`, `customer:booking_confirmed_paid:${bookingId}`.
- Non-OK responses logged; **not** thrown (payment/booking state stays safe if notify fails).
- Capture-reversed path also uses the helper for header parity.

Regression: `src/lib/paid-booking-notify-headers-1853.test.ts` (3 tests).

Deployed:

```
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy reconcile-checkout-session --no-verify-jwt
```

(Both bundle `_shared/promote-paid-from-checkout.ts`.)

---

## 4. REAL TEST FLOW

1. Traveler session `mirov.vesterinen@gmail.com` on local Vite `127.0.0.1:5173`.
2. Listing `c2d25217-…` Guaranteed Northern Lights Tour · Tue 17 Nov 2026 · Hotel pickup · 1 Adult · €189.
3. Checkout → Stripe TEST Checkout `cs_test_a1SdHeX0…` → card `4242…` → Pay.
4. Return URL: Booking confirmed **#45**.
5. DB: `payment_status=paid`, `status=confirmed`, `amount_paid=189`, PI `pi_3UMQpVC3BaJIHpM60ON0yyuY`.
6. Email log: both rows `status=sent` with Resend provider ids (provider acceptance — **not** mailbox delivery).

---

## 5. IDEMPOTENCY + ISOLATION

| Check | Result |
|-------|--------|
| Exactly one customer paid-confirm row for #45 | **YES** |
| Exactly one supplier new_booking row for #45 | **YES** |
| Unique constraint `transactional_email_log_idempotency_key_unique` | Duplicate insert → Postgres `23505` |
| Traveler not in supplier To list | **YES** |
| Supplier list includes `contact@royalnordic.fi` (controlled) | **YES** |
| Stranger / demo addresses absent on #45 rows | **YES** |
| Booking remains paid/confirmed after notify | **YES** |
| External CLI JWT replay of notify | Still 401 (CLI JWT ≠ Deno env service key) — does **not** block webhook path; webhook uses matching Deno.env key for both headers |

Webhook retry idempotency is enforced by the unique idempotency key claim before Resend send (existing architecture). Duplicate key insert proven at DB.

---

## 6. SAFETY

- Stripe remained TEST.
- No client-side email send introduced.
- No RLS weakening; no service-role in browser.
- Notify failure remains soft (logged, non-throwing) so payment promotion cannot be corrupted by email outages.
- Refund idempotency / inventory architecture untouched.

---

## 7. REMAINING CERTIFICATION GAPS (post-1853)

| Gap | Priority |
|-----|----------|
| Supplier → traveler messaging + email | P1 — **next** |
| Supplier signup→create→publish→book golden | P1 |
| Declined / abandoned / double-pay Stripe | P1 |
| Admin verification approve/reject + email | P1 |
| Soft-notification honesty UX | P1 |
| Checkout auth-resume browser re-prove | P1 |
| Mobile golden journey | P1 |
| Mailbox content inspection (provider ≠ delivered) | P1/P2 |
| Historical #44 paid emails | N/A — not backfilled |

---

## 8. COMMAND VERIFICATION

```
vitest paid-booking-notify-headers-1853 + checkout-auth-resume  # 7 pass
supabase functions deploy stripe-webhook                       # ok
supabase functions deploy reconcile-checkout-session            # ok
Stripe TEST book #45                                           # confirmed paid
transactional_email_log                                        # 2 sent rows
duplicate idempotency insert                                   # 23505
```

---

## 9. FINAL VERDICT

**B. READY FOR LIMITED TEST USERS, NOT LIVE MONEY**

Successful-payment transactional email path is now an authoritative, idempotent, server-side webhook side-effect with real TEST proof on booking #45.
