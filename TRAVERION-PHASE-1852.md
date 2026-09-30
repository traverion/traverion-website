# TRAVERION PHASE 1852 — UNVERIFIED-PATH + EMAIL DELIVERY CERTIFICATION

**Date:** 2026-10-01  
**Branch:** `main`  
**Stripe:** TEST only (LIVE not enabled)  
**Starting SHA:** `d502b73bf6db2d804f7197b8b8433294ebc978df` (post-1851; Phase 1851 cert ending SHA was `877e0ab`)  
**Ending SHA:** _(set at commit)_  
**Working tree:** clean after this commit  
**Origin:** `main` tracks `origin/main` (push not performed this phase)

---

## 1. EXECUTIVE RESULT

Phase 1852 closed several of the largest Phase 1851 money/comms gaps with **real TEST execution**:

- Refundable far-future book → Stripe TEST pay → traveler cancel (**Eligible for refund**) → ledger reversal → Stripe TEST refund → `payment_status=refunded` + `refund_completed` emails to **both** controlled parties.
- Traveler→supplier messaging **persisted** and triggered `guest_message` to `contact@royalnordic.fi`.
- Support Contact submitted to platform destination `info@traverion.com` (not forced to Royal Nordic).
- **P1 checkout auth-resume** root cause fixed in code (tour blank on `user?.id` remount + URL step sync).
- **P3 duplicate Guest phone** fixed (client+claim double-emit).

**Not closed:** supplier create-from-scratch / calendar / admin / mobile golden / declined+abandoned Stripe / supplier→traveler reply / mailbox content inspection / auto `booking_confirmed_paid` + `new_booking` on pay (no log rows after #44 pay; cancel/refund/message paths *did* send).

**Verdict: B. READY FOR LIMITED TEST USERS, NOT LIVE MONEY**

---

## 2. 1851 OPEN ITEMS → 1852

| Item | Result |
|------|--------|
| Refundable Stripe TEST cancel/refund | **VERIFIED** (booking #44) |
| Refund ledger reversal | **VERIFIED** (−189 once at cancel) |
| Refund inventory restoration | **PARTIALLY VERIFIED** (weekday capacity model; no double book observed) |
| Refund CSV/audit | **NOT VERIFIED** (export UI not re-run) |
| Supplier signup/onboarding | **NOT VERIFIED** |
| Supplier create-from-scratch | **NOT VERIFIED** |
| Supplier publish | **NOT VERIFIED** |
| Supplier calendar edit | **NOT VERIFIED** |
| Supplier→traveler listing parity | **NOT VERIFIED** (new tour) |
| Traveler→supplier messaging | **VERIFIED** (DB + email) |
| Supplier→traveler messaging | **NOT VERIFIED** |
| Messaging persistence | **VERIFIED** (traveler→supplier) |
| Support/contact email | **VERIFIED** (provider accepted → info@traverion.com) |
| Supplier booking email | **PARTIALLY VERIFIED** (cancel/refund/message yes; auto new_booking on pay **missing**) |
| Traveler booking email | **PARTIALLY VERIFIED** (welcome + cancel + refund; paid confirm **missing**) |
| Cancellation emails | **VERIFIED** (provider accepted both parties) |
| Refund emails | **VERIFIED** (provider accepted both parties) |
| Schedule/pickup emails | **NOT VERIFIED** |
| Supplier verification emails | **NOT VERIFIED** |
| Password-reset email | **NOT VERIFIED** |
| Reminder / review-request | **NOT VERIFIED** |
| Admin verification | **NOT VERIFIED** |
| Declined Stripe | **NOT VERIFIED** |
| Abandoned Stripe | **NOT VERIFIED** |
| Checkout auth-resume P1 | **FIXED** (code + regression tests; browser re-prove deferred) |
| Mobile checkout | **NOT VERIFIED** |
| Partner authenticated e2e | **NOT VERIFIED** |
| Soft notification failures | **STILL OPEN** |
| Duplicate guest-phone P3 | **FIXED** |

---

## 3. TRAVELER CERTIFICATION

| Flow | Label |
|------|--------|
| Login as `mirov.vesterinen@gmail.com` | **BROWSER VERIFIED** |
| Tour checkout Nov 16 2026 · 1 Adult · €189 | **BROWSER VERIFIED** |
| Stripe TEST pay | **STRIPE TEST VERIFIED** |
| Confirmation #44 | **BROWSER VERIFIED** |
| Trips card Confirmed/Paid then Cancelled/Refund due/Refunded | **BROWSER VERIFIED** |
| Message send | **BROWSER VERIFIED** + **API VERIFIED** |

---

## 4–7. SUPPLIER / CREATE / PARITY / CALENDAR

`contact@royalnordic.fi` created as Auth user and linked as **manager** team member on listing owner `22217025-…` so supplier notifies include that address.

Supplier wizard create/publish/calendar/parity/partner portal e2e: **NOT VERIFIED** this phase (time spent on refund + messaging + support + auth-resume fix).

---

## 8–10. REFUNDABLE BOOKING / FULL REFUND / MONEY

### Booking #44 (cross-party TEST)

| Field | Value |
|-------|--------|
| id | `ecde5dea-34ca-4530-b5c5-99c5edcb41b9` |
| Ref | `#44` |
| Traveler | `mirov.vesterinen@gmail.com` |
| Listing | Guaranteed Northern Lights Tour |
| Date | 2026-11-16 · 20:00 |
| Amount | €189 EUR |
| Stripe Checkout | `cs_test_a1cf6HvOR5GyApggrF9ASrs3rzVg7L6dXGC2Ct9npABqxJdsS3UKkw24R7` |
| PaymentIntent | `pi_3ULWhtC3BaJIHpM60OHYAgTu` |
| Refund | `re_3ULWhtC3BaJIHpM60SAaeoMA` succeeded |
| Final | `status=cancelled`, `payment_status=refunded`, `refund_choice=full_refund` |

### Ledger

1. `booking_earnings` +189  
2. `refund` −189 at cancel (“Cancelled booking earnings reversal”)  
3. No second reversal on Stripe `charge.refunded` (idempotent money)

### Idempotency

Second Stripe refund → `charge_already_refunded` (**STRIPE TEST VERIFIED**).

---

## 11. MESSAGING BOTH DIRECTIONS

| Direction | Result |
|-----------|--------|
| Traveler → Supplier | **VERIFIED** — DB row `sender_role=traveler`; `guest_message` email to `contact@royalnordic.fi,…` status `sent` |
| Supplier → Traveler | **NOT VERIFIED** |

---

## 12. SUPPORT

- Topic: My trip  
- DB `contact_inquiries` row created  
- Email `contact_inquiry` → **`info@traverion.com`** (platform support — correct architecture)  
- Provider message id present; status `sent`  
- UI: success / received  
- **MAILBOX VERIFIED:** no (staff inbox not opened)

---

## 13. ADMIN

**NOT VERIFIED**

---

## 14. PAYMENT FAILURE PATHS

Declined / abandoned / duplicate pay click: **NOT VERIFIED**

---

## 15. CHECKOUT AUTH RESUME

**Root cause:** `TourDetails` listing effect depended on `[tourId, user?.id]` and called `setTour(null)` on login → BookingPage unmounted mid-checkout → remounted with stale React `locationSearch` stuck at `step=review` (because `handleCheckoutUrlState` updated `history` but not React state).

**Fix:**

1. Blank tour only on `tourId` change.  
2. Sync `setLocationSearch` after checkout URL replaceState.  
3. Regression tests in `checkout-auth-resume-1704.test.ts`.

**BROWSER re-verify after fix:** not completed this run (code + automated source tests only).

---

## 16. MOBILE

**NOT VERIFIED**

---

## 17. EMAIL DELIVERY MATRIX (tested events)

| EVENT | FROM | TO | REPLY-TO | SUBJECT | TRIGGER | PROVIDER | DELIVERY | LINK | DUPLICATE | VERDICT |
|-------|------|-----|----------|---------|---------|----------|----------|------|-----------|---------|
| traveler_welcome | Traverion no-reply (configured) | mirov.vesterinen@gmail.com | (provider) | Welcome to Traverion | signup/admin create | sent `01a0f496-…` | **DELIVERY NOT CONFIRMED** | n/a | n/a | PROVIDER ACCEPTED |
| booking_confirmed_paid | — | traveler | — | — | Stripe pay promote | **NO LOG ROW for #44** | — | — | — | **P1 GAP** |
| supplier new_booking | — | supplier team | — | — | Stripe pay promote | **NO LOG ROW for #44** | — | — | — | **P1 GAP** |
| guest_message | SUPPLIER_EMAIL_FROM | contact@royalnordic.fi + owner + viewer | — | (guest message) | traveler send | sent | **DELIVERY NOT CONFIRMED** | not opened | n/a | PROVIDER ACCEPTED |
| booking_cancelled (customer) | customer from | mirov.vesterinen@gmail.com | — | cancel | traveler cancel | sent | **DELIVERY NOT CONFIRMED** | not opened | idempotency key present | PROVIDER ACCEPTED |
| booking_cancelled (supplier) | SUPPLIER_EMAIL_FROM | contact@royalnordic.fi,… | — | cancel | traveler cancel | sent | **DELIVERY NOT CONFIRMED** | not opened | key present | PROVIDER ACCEPTED |
| refund_completed (customer) | customer from | mirov.vesterinen@gmail.com | — | refund | Stripe charge.refunded | sent | **DELIVERY NOT CONFIRMED** | not opened | key present | PROVIDER ACCEPTED |
| refund_completed (supplier) | SUPPLIER_EMAIL_FROM | contact@royalnordic.fi,… | — | refund | Stripe charge.refunded | sent | **DELIVERY NOT CONFIRMED** | not opened | key present | PROVIDER ACCEPTED |
| contact_inquiry | CONTACT/SUPPLIER from | info@traverion.com | traveler email (intended) | Contact · My trip | form submit | sent | **DELIVERY NOT CONFIRMED** | n/a | n/a | PROVIDER ACCEPTED |

Manual non-gate event types `booking_paid` / `booking_confirmed` / `booking_created` were also provider-accepted to `contact@royalnordic.fi` during probing (not product webhook path).

---

## 18. TRAVELER EMAIL RESULTS (`mirov.vesterinen@gmail.com`)

| Event | Result |
|-------|--------|
| Welcome | PROVIDER ACCEPTED |
| Paid confirmation | **NOT OBSERVED** after #44 pay |
| Message (as recipient) | N/A this direction |
| Cancellation | PROVIDER ACCEPTED |
| Refund completed | PROVIDER ACCEPTED |
| Support ack to traveler | Product does not appear to send traveler ack (staff only) — not invented |

**MAILBOX VERIFIED:** nowhere (Gmail not inspected).

---

## 19. SUPPLIER EMAIL RESULTS (`contact@royalnordic.fi`)

| Event | Result |
|-------|--------|
| New paid booking (webhook) | **NOT OBSERVED** |
| Guest message | PROVIDER ACCEPTED (in To list) |
| Cancellation | PROVIDER ACCEPTED |
| Refund completed | PROVIDER ACCEPTED |

**MAILBOX VERIFIED:** nowhere.

---

## 20. CROSS-PARTY ROUTING

| Graph | Status |
|-------|--------|
| Traveler → Supplier notification | **Works** (message) — provider accepted |
| Supplier → Traveler notification | **NOT VERIFIED** |
| Booking → both parties | **Incomplete** — traveler paid confirm + supplier new_booking missing on pay |
| Cancellation → both | **Works** (provider accepted) |
| Refund → both | **Works** (provider accepted) |
| Schedule/pickup | **NOT VERIFIED** |

---

## 21. EMAIL FAILURES DISCOVERED

1. **P1 — Paid booking confirmation emails not logged after successful #44 pay**  
   Ledger + booking paid succeeded; `transactional_email_log` has no `customer:booking_confirmed_paid:…44` and no `supplier:new_booking:…44`. Cancel/refund/message paths *do* send. External invoke of service-role-gated kinds with CLI JWT returns 401 (key mismatch vs edge env) — complicates reproduction; webhook refund path proves service-role notify *can* work.

2. Soft notification honesty UX still open (1800/1851 carry-forward).

---

## 22. OTHER BUGS DISCOVERED / FIXED

### P1 — FIXED: Checkout auth resume resets to Trip
- **Repro:** Login mid-checkout → URL/UI back on Trip (`step=review`).  
- **Cause:** `setTour(null)` on `user?.id` + unsynced `locationSearch`.  
- **Fix:** TourDetails blank-on-tourId-only + checkout URL state sync.  
- **Verify:** unit/source tests; browser re-run pending.

### P3 — FIXED: Duplicate `Guest phone` in `special_requests`
- **Repro:** Booking notes showed two Guest phone lines.  
- **Cause:** BookingPage merged phone into `specialRequests` *and* claim builder added `customerPhone`.  
- **Fix:** Stop embedding phone in merged notes; strip Guest phone lines when `customerPhone` set.  
- **Verify:** booking #44 notes have **one** Guest phone line; tests added.

### P2 — Gallery content mismatch
- Unchanged (supplier media, not platform).

---

## 23. SECURITY / PRIVACY

- Contact inquiry correctly targets platform support, not an arbitrary supplier.  
- Message notify recipients = listing owner team (includes test `contact@royalnordic.fi`); no cross-traveler leak observed.  
- Stripe remained TEST (`sk_test`).  
- Viewer team member still present on supplier notify To-list (expected team fan-out; not a traveler privacy leak).

---

## 24. REMAINING P0

- Stripe LIVE enablement (founder) — untouched.  
- No new money corruption found on #44 refund path.

## 25. REMAINING P1

- Auto paid-confirmation emails (traveler + supplier new_booking) after successful pay.  
- Supplier→traveler messaging + email.  
- Supplier create/publish/calendar golden path.  
- Declined / abandoned Stripe.  
- Admin verification honesty.  
- Soft notify failure honesty.  
- Browser re-verify auth-resume after fix.  
- Mobile checkout golden.

## 26. REMAINING P2

- Partner portal empty states / gallery content QA.  
- CSV export audit of refund rows.

## 27. REMAINING P3

- None outstanding from 1851 phone dup (fixed).

---

## 28. VERIFICATION MATRIX

| Flow | Label |
|------|--------|
| Refundable book→pay→cancel→Stripe refund | BROWSER + STRIPE TEST + API VERIFIED |
| Ledger reverse once | API VERIFIED |
| Traveler→supplier message | BROWSER + API VERIFIED |
| Cancel/refund emails (provider) | API VERIFIED |
| Support contact | BROWSER + API VERIFIED |
| Auth-resume fix | AUTOMATED-TEST VERIFIED (code); browser pending |
| Guest phone single line | API VERIFIED on #44 |
| Paid confirmation emails on pay | **NOT VERIFIED** (missing) |
| Supplier create/calendar/admin/mobile | **NOT VERIFIED** |
| Mailbox content | **NOT VERIFIED** / DELIVERY NOT CONFIRMED |

---

## 29. COMMAND VERIFICATION

```
tsc --noEmit -p tsconfig.json          # pass
vitest booking-notes + checkout-auth-resume  # pass (12)
Stripe TEST refund create              # succeeded
Stripe second refund                   # charge_already_refunded
```

---

## 30. FINAL VERDICT

**B. READY FOR LIMITED TEST USERS, NOT LIVE MONEY**

Evidence is stronger than 1851 on refund money + cancel/refund emails + traveler messaging + support.  
Not **C**: paid-booking email path incomplete; supplier create/admin/mobile/failure-paths still open; mailbox content never inspected.

Stripe remains **TEST**.
