# TRAVERION PHASE 1859 — SOFT-NOTIFICATION FAILURE HONESTY

**Date:** 2026-10-04  
**Branch:** `main`  
**Stripe:** TEST only  
**Starting SHA:** `653a6e2b4f02eba10e4b06080385393edcc8d97e`  
**Ending SHA:** `d49276d28cfc4c1a0c408e06e92d0a5bbb83beba`  
**Working tree:** clean after ending-SHA record  
**Origin:** local `main` ahead of `origin/main` (push not performed)

---

## 1. EXECUTIVE RESULT

Audit found **no P0** where notify failure rolls back money/DB or falsely claims the primary operation failed. Paid promotion, refunds, admin verification, and confirmation copy were already **HONEST**.

This phase closed the remaining **P1 UX/observability** gaps:

| Gap | Fix |
|-----|-----|
| MyBookings swallowed `success:true` + soft `error` (1794 thread/email) | Surface as warn success callout |
| Client cancel / cancel-resolve / messaging / partner cancel-request used `void` notify | Await + return SoftNotifyResult; soft-warn UI |
| Stripe webhook refund notify ignored HTTP status | Log `!res.ok` without failing refund |

**Authoritative business result** and **notification result** are now separate truths on these paths.

---

## 2. HYPOTHESIS

If Resend/edge notify fails after RPC/Stripe commit, users or operators might see a hard failure (or silence) that misrepresents booking/cancel/message/refund truth.

**Proven:** Money/webhook paths already log-only. Client voids hid soft failures; one UI path discarded soft warnings.

---

## 3. EVIDENCE

### Already HONEST (certified by audit + prior phases)

- `notifyPaidBookingSideEffects` — try/catch, no throw (**UNIT / code**)
- Admin verification `ok: true` + `email.sent: false` UI (**UNIT** 1795; **BROWSER** 1858)
- Booking confirmation copy does not promise email (**UNIT**)
- Contact form intentionally requires notify for “received” (**UNIT** 1701)

### Fixed this phase

| Path | Label |
|------|--------|
| SoftNotify helpers | **UNIT VERIFIED** |
| Note save soft warning in Trips | **UNIT VERIFIED** (source) |
| Traveler self-cancel `notifyWarning` | **UNIT VERIFIED** |
| Cancellation resolve soft append | **UNIT VERIFIED** |
| Message thread warn callout | **UNIT VERIFIED** |
| Partner cancel-request soft `setError` | **UNIT VERIFIED** |
| Webhook refund notify `res.ok` logs | **UNIT VERIFIED** |
| Live Resend fault injection | **NOT VERIFIED** |
| Browser soft-warn UX | **NOT VERIFIED** (source/tests only) |
| Mailbox | **NOT VERIFIED** |

Regression suite: `soft-notify-1859.test.ts` + prior 1794/1795/1796/1797/copy — **43 pass**.

---

## 4. CHANGES

- `src/lib/softNotify.ts` — SoftNotifyResult + merge helpers  
- `src/data/supabase-booking-ops.ts` — notify fns return SoftNotifyResult  
- `src/data/supabase-bookings.ts` — await cancel/note notifies; `notifyWarning`  
- `src/pages/MyBookings.tsx` — surface soft warnings  
- `src/pages/supplier/SupplierBookings.tsx` — cancel-request soft surface  
- `src/components/BookingMessageThread.tsx` — warn (not danger) on notify fail  
- `supabase/functions/stripe-webhook/index.ts` — refund notify `res.ok` logging  
- `src/lib/soft-notify-1859.test.ts`

---

## 5. SAFETY

- No Stripe LIVE; no RLS weaken.  
- Notify failure cannot return `success: false` after cancel/message/note RPC.  
- Idempotent skips (`already_sent`) are not treated as failures.  
- Webhook still returns refund success after notify log.

---

## 6. WHAT REMAINS UNVERIFIED

1. Checkout auth-resume **browser** re-verification  
2. Mobile traveler golden journey  
3. Admin **payout** verification approve/reject browser path  
4. Real mailbox/content/link verification  
5. Schedule/pickup planner soft-notify surface (still void; copy does not claim email)  
6. Admin decision email **retry** when `email.sent: false`  
7. Paid superseded-session live race (architecture/unit already present)

---

## 7. NEXT HIGHEST-VALUE PHASE

**1860 — Checkout auth-resume browser certification** (highest unverified traveler commercial path after soft-notify).

---

## 8. COMMANDS

```
vitest soft-notify-1859 + note-thread-await-1794 + verification-email-surface-1795
     + cancel-resolve-always-notify-1797 + cancel-request-auth-email-1796
     + booking-confirmation-copy   # 43 pass
```
