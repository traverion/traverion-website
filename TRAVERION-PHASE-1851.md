# TRAVERION PHASE 1851 — MARKETPLACE GOLDEN-JOURNEY CERTIFICATION

**Date:** 2026-10-01  
**Branch:** `main`  
**Stripe:** TEST only (LIVE not enabled)  
**Starting SHA:** `77e9589` (Phase 1850)  
**Ending SHA:** _(this commit)_  

---

## 1. EXECUTIVE RESULT

A real traveler golden path was executed in the browser against live TEST backend:

**Discover → Tour → Auth → Stripe TEST pay → Confirmation → Trips → Cancel (no-refund window).**

Two **P0 checkout blockers** were found and fixed during the run:

1. `supplier_team_members` SELECT RLS infinite recursion → authenticated travelers could not advance Trip → Contact.  
2. Edge legacy Adult/Child coalesce dropped season `availabilityDateFrom` → Stripe session create returned “not available to book” while the PDP still looked bookable.

**Verdict: B. READY FOR LIMITED TEST USERS, NOT LIVE MONEY**  
(Stripe remains TEST. Full refund Stripe path, supplier create-from-scratch UI, and admin e2e were not fully browser-certified this phase.)

---

## 2. TRAVELER GOLDEN JOURNEY

| Step | Result | Method |
|------|--------|--------|
| Home desktop | Brand-first hero, search, destinations | **BROWSER VERIFIED** |
| Home mobile 390px | Menu + compact search sheet entry | **BROWSER VERIFIED** |
| Tours browse | 1 published tour, price/location/rating honesty | **BROWSER VERIFIED** |
| Stays browse | 1 stay (€185/night, guests/bedrooms) | **BROWSER VERIFIED** |
| Tour PDP + calendar | Date/option/participants; TEST checkout copy | **BROWSER VERIFIED** |
| Sign up at Pay | Email confirmation required (honest) | **BROWSER VERIFIED** |
| Confirm email (admin) | Required to continue TEST booking | Admin API (test tooling) |
| Login mid-checkout | Session restored; booking resumed after RLS fix | **BROWSER VERIFIED** |
| Stripe TEST pay €189 | `cs_test_…` → success | **BROWSER VERIFIED** |
| Confirmation UI | Ref #43, tour, date, 1 Adult, €189 | **BROWSER VERIFIED** |
| Trips | Upcoming card + detail match payment | **BROWSER VERIFIED** |
| Cancel | Cancelled · No refund (within 24h of start) | **BROWSER VERIFIED** |
| Messaging send | Composer present; send not confirmed in DB | **NOT VERIFIED** (UI only) |

### Booking truth (same story)

| Field | Value |
|-------|-------|
| Booking id | `7497d289-3189-4711-a6e1-502e5571e663` |
| Ref | `#43` |
| Listing | Guaranteed Northern Lights Tour |
| Option | Hotel pickup (`4f92ff72-…`) |
| Date / time | 2026-10-01 · 20:00 |
| Participants | 1 Adult |
| Amount | €189 EUR paid |
| Stripe | `cs_test_a1DXOXrM5mWfANkdu2mfP5M3AEAvGCxfWkZyorUigUoY7v1NpkHKPyIlft` |
| Ledger | `booking_earnings` +189 EUR |
| After cancel | `status=cancelled`, `payment_status=paid`, `refund_choice=no_refund` |

---

## 3. SUPPLIER GOLDEN JOURNEY

| Step | Result | Method |
|------|--------|--------|
| Partner routes exist (`/login`, `/partner/*`, `/for-partners`) | Mapped | **CODE-INSPECTION** |
| Signup → verify → create → publish | Not fully walked this phase | **NOT VERIFIED** |
| Receive booking / Money | Ledger row exists for paid booking | **AUTOMATED** (service select) |
| Operate cancel visibility | Traveler cancel succeeded; partner UI not re-opened | **NOT VERIFIED** (partner UI) |

---

## 4. BOOKING / STRIPE TEST

- Payment: **BROWSER VERIFIED** (Stripe sandbox Pay)  
- Booking row: confirmed → paid, then cancelled / no_refund  
- Inventory: weekday capacity model (no `listing_availability` row required); no double booking observed  
- Confirmation + Trips: match amount/date/option  
- Money: supplier ledger +189 EUR on pay; no reversal on no-refund cancel (consistent with policy)

---

## 5. CANCEL / REFUND

| Path | Result | Method |
|------|--------|--------|
| Traveler cancel within 24h | UI blocks refund; booking cancelled | **BROWSER VERIFIED** |
| Stripe refund of paid booking | Not executed (policy correctly blocked refund) | **NOT VERIFIED** |
| Inventory release / ledger reversal on refund | N/A this run | **NOT VERIFIED** |

---

## 6. COMMUNICATION

| Flow | Result | Method |
|------|--------|--------|
| Support Contact form | Not re-exercised this phase | **NOT VERIFIED** |
| Booking confirmation email | Honesty copy: Trips is confirmation; email not proof | **BROWSER** (UX copy) |
| Traveler ↔ supplier message send | Failed to confirm persistence | **NOT VERIFIED** |
| Reminders / review request | Not due yet | **NOT VERIFIED** |

---

## 7. LISTING CREATION

Full wizard create-from-scratch: **NOT VERIFIED** this phase (time spent on traveler money path + P0 fixes).

Supplier→traveler parity spot-check on existing published tour: title/price/options matched extras. Adult option had empty `availabilityDateFrom` (data); Child had a from-date — edge coalesce previously discarded it (**fixed**).

---

## 8. CALENDAR / AVAILABILITY

Tour weekday calendar (Sat not offered) **BROWSER VERIFIED**. Supplier calendar edit ↔ traveler refresh: **NOT VERIFIED**.

---

## 9. REVIEWS

No reviews on listing (“No reviews yet”) **BROWSER VERIFIED**. Post-completion review journey: **NOT VERIFIED** (booking cancelled before travel).

---

## 10. SUPPLIER TEAM / VIEWER RLS

Created confirmed viewer JWT on supplier `22217025-…` and probed:

| Surface | Viewer SELECT | Notes |
|---------|---------------|-------|
| `supplier_profiles` | 0 rows | Fail-closed ✓ |
| `supplier_earnings` | 0 | ✓ |
| `supplier_ledger_entries` | 0 | ✓ |
| `supplier_message_campaigns` | 0 | ✓ |
| `supplier_export_runs` | 0 | ✓ |
| `booking_payment_events` | 0 | ✓ |
| `listings` / `bookings` | Visible | Expected ops surfaces |
| `booking_messages` | Visible via `is_booking_party` (any team role) | Documented; not editor-only |

Phase 1800 P0 “viewer cannot select sensitive profile/earnings/campaign” — **BROWSER/API VERIFIED** for those tables.

---

## 11. ADMIN

Admin verification queue / approve email honesty: **NOT VERIFIED** this phase.

---

## 12. MOBILE

Home @ ~390px: hamburger, compact search, brand hero — **BROWSER VERIFIED**. Full booking/checkout on mobile width: **PARTIALLY VERIFIED** (desktop width used for Stripe).

---

## 13. VISUAL QA

Home / Tours / Tour PDP / Checkout / Confirmation / Trips look coherent with 1801–1828 polish. Tour gallery includes a non-Arctic secondary photo (content quality, not code) — **P2**.

---

## 14. ACCESSIBILITY

Skip link present; booking progress labeled; consent checkbox gates Pay. Deep WCAG rewrite not attempted. **PARTIALLY VERIFIED**.

---

## 15. FAILURE TESTS

| Case | Result |
|------|--------|
| Unauthenticated Pay | Auth modal (honest) |
| Unconfirmed signup | “Check your email” honesty |
| Checkout before RLS fix | Could not leave Trip step |
| Season gate before edge fix | “not available to book” |
| Double booking | Not observed on single TEST pay |
| Declined card / abandoned Stripe | **NOT VERIFIED** |

---

## 16. BUGS DISCOVERED

### P0 — FIXED: `supplier_team_members` RLS recursion
- **Repro:** Logged-in traveler clicks Go to checkout → stays on Trip; team query returns `42P17`.  
- **Root cause:** Migration 156 SELECT policy `EXISTS` on same table.  
- **Fix:** Migration `236_supplier_team_members_select_no_recursion.sql` — SECURITY DEFINER helpers.  
- **Verify:** Traveler JWT team query 200; checkout advanced to Contact/Pay.

### P0 — FIXED: Edge coalesce season window dropped
- **Repro:** Pay → “This listing is not available to book.” PDP still bookable.  
- **Root cause:** Edge `coalesceLegacyParticipantTicketOptions` kept Adult empty `availabilityDateFrom`, ignoring Child’s from-date; season gate fail-closed.  
- **Fix:** Port client Phase 1508 season merge (+ open-ended `To` handling) into `supabase/functions/_shared/booking-quote.ts`; redeploy `create-booking-checkout-session`. Also repaired Adult from-date on the live listing.  
- **Verify:** Stripe Checkout opened; payment succeeded.

### P1 — Login mid-checkout reset to Trip
- After auth, URL returned to `step=review`. Flow recoverable; resume polish still weak. **Not code-fixed** this phase beyond RLS unblock.

### P2 — Tour gallery content mismatch
- Tropical pool image on Northern Lights listing (supplier data).

### P3 — Duplicate “Guest phone” lines in `special_requests`
- Observed on booking row.

---

## 17. REMAINING ISSUES

**P0**
- Stripe LIVE enablement + LIVE webhook smoke (founder).  
- Full refund + CSV audit operator path still open (this cancel was no-refund).

**P1**
- Soft-surface notify failures (from 1800).  
- Traveler messaging send persistence not confirmed.  
- Supplier create/publish golden UI not browser-certified.  
- Checkout auth resume should keep Contact/Pay step.

**P2**
- Viewer empty states for blocked Money/profile.  
- Gallery content QA.  
- Partner authenticated e2e.

**P3**
- Duplicate guest phone notes.

---

## 18. VERIFICATION MATRIX

| Flow | Label |
|------|-------|
| Home / browse / tour PDP | BROWSER VERIFIED |
| Stay browse | BROWSER VERIFIED |
| Auth signup/login | BROWSER VERIFIED |
| Stripe TEST pay | BROWSER VERIFIED |
| Confirmation / Trips | BROWSER VERIFIED |
| Cancel (no refund) | BROWSER VERIFIED |
| Viewer sensitive SELECT | AUTOMATED-TEST / API VERIFIED |
| Refund Stripe | NOT VERIFIED |
| Supplier wizard + calendar edit | NOT VERIFIED |
| Admin | NOT VERIFIED |
| Messaging | NOT VERIFIED |
| Contact support email | NOT VERIFIED |
| Payment decline / abandon | NOT VERIFIED |

---

## 19. COMMAND VERIFICATION

```
git status          # clean after this commit
tsc --noEmit        # pass
vitest legacy-participant-options.test.ts  # pass (6)
supabase db push    # migration 236 applied
supabase functions deploy create-booking-checkout-session  # deployed
```

---

## 20. PRODUCTION VERDICT

**B. READY FOR LIMITED TEST USERS, NOT LIVE MONEY**

Evidence: end-to-end TEST book→pay→Trips→cancel works after P0 fixes.  
Not stronger: LIVE Stripe untouched; refund money path not proven; supplier create and several comms paths still open.

Stripe remains **TEST**.
