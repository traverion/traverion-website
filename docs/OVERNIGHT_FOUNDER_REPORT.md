# Traverion overnight mission — founder report

**Date:** 2026-09-09  
**Remote:** `github.com:traverion/traverion-website.git`  
**Linked DB:** Supabase `xcopqllkulxfkpunetbc`  
**Durable phase log:** `/tmp/tv-overnight-mission-log.md` (101 phases)

---

## 1. EXECUTIVE VERDICT

**Classification: FUNCTIONALLY COMPLETE WITH EXTERNAL BLOCKER**

Core traveler booking, supplier operations, inventory honesty, and ledger accounting work on Stripe **TEST**. Transactional email cannot be proven: Resend rejects the stored `RESEND_API_KEY`. No inbox proof was fabricated.

**Stripe status:** TEST

---

## 2. START / END STATE

| | |
|---|---|
| **Original starting SHA** | `c9dac6336f3c8c03bbbd1a6a8b0714585085510a` |
| **Final SHA** | `96fc962e9f5782f06006065426de6123496d28a2` |
| **Commits this mission** | 100 |
| **Remote `main`** | Matches final SHA (`origin/main`) |
| **Linked DB** | `xcopqllkulxfkpunetbc` |
| **Deployment** | Site on `main`; edge functions redeployed when changed (`notify-customer-booking`, `notify-supplier-event`, `create-booking-checkout-session`, `stripe-webhook`, etc.) |
| **Tests at stop** | **181 passed** (37 files); `tsc` clean |

---

## 3. PHASES COMPLETED

Full acceptance notes live in `/tmp/tv-overnight-mission-log.md`. Compact index:

| # | Title | SHA |
|---|---|---|
| 1 | Supplier-fault cancellation accounting | `c9dac63` → `7c22b3f` |
| 2 | Force majeure = €0 | `7c22b3f` → `7c22b3f` |
| 3 | Negative balance + earning offset | `7c22b3f` → `d7f804e` |
| 4 | Customer lifecycle email | `d7f804e` → `0c05212` |
| 5 | Certification audit | `0c05212` → `0c05212` |
| 6 | `/tours/<uuid>` deep links | `0c05212` → `acd2a85` |
| 7 | `/stays/<uuid>` deep links | `acd2a85` → `8ba2f60` |
| 8 | Stay amenity display casing | `8ba2f60` → `a43d07b` |
| 9 | Honest refund copy (auto-refund OFF) | `a43d07b` → `1bdc3f9` |
| 10 | Hide internal booking notes | `1bdc3f9` → `b1e0f3a` |
| 11 | Upcoming excludes cancelled/refunded | `b1e0f3a` → `62e68aa` |
| 12 | Failed checkouts are not Upcoming trips | `62e68aa` → `96c5a08` |
| 13 | Public stay calendar is paid nights only | `96c5a08` → `3df6e46` |
| 14 | Public tour sold-out is paid guests only | `3df6e46` → `9ae0587` |
| 15 | Tour checkout counts paid guests without availability rows | `9ae0587` → `44529e8` |
| 16 | Live pending tour hold occupies, then releases | `44529e8` → `44529e8` |
| 17 | Checkout edge occupancy matches SQL | `44529e8` → `b16f4e4` |
| 18 | Stay checkout ignores stale booked counts | `b16f4e4` → `95c728e` |
| 19 | Partner stay calendar occupancy from paid+holds | `95c728e` → `840d874` |
| 20–56 | Partner live lists, pickup, refunds, capacity, Money/Bookings honesty, notify durability | see mission log |
| 57–76 | Legal/marketing email promises; Refund due surfaces; cancel notify honesty | see mission log |
| 77–86 | Booking-request / Trips durable footers; review/notify submit≠send | see mission log |
| 87–101 | Money collected≠paid out; onboarding/publish/contact/cancel/Trips honesty polish | see mission log |

**Phase 102:** STOP — honesty/ops polish exhausted without inventing Resend or live Stripe. No further overnight phase armed.

---

## 4. ACCOUNTING CERTIFICATION

| Case | Expected | Actual |
|---|---|---|
| **Supplier fault** (booking #19, `SUPPLIER_STAFF_UNAVAILABLE`, traveler accept) | exactly one **-€20** `cancellation_penalty`; replay idempotent | **-€20** once (`8c3d11a5-…`); second accept `already:true` |
| **Force majeure** (booking #20) | **€0** fee; no penalty ledger row | **€0**; no penalty row; balance stayed **-€20** from #19 |
| **Negative balance + earning** (booking #21 paid) | later sale offsets fee | **-€20 → +€189** → ledger net **€169**; earnings row unique on replay |

Money path after #21: collected includes paid earnings; adjustments include the fee. Auto-refund remained **OFF**; Stripe charges for #19/#20 were **not** refunded by the agent.

---

## 5. EMAIL CERTIFICATION

| | |
|---|---|
| **Provider** | Resend |
| **Function** | `notify-customer-booking` (and related supplier notify) |
| **Provider acceptance** | **Rejected** — `RESEND_API_KEY` invalid (secret present; Resend still rejects) |
| **Inbox proof** | **None** |

**Blocker:** Founder must replace `RESEND_API_KEY` with a valid Resend key. Product copy was updated so the UI does not treat email delivery as confirmation truth while this fails.

---

## 6. TRAVELER FLOW STATUS

| Area | Status |
|---|---|
| **Discovery** | Home / catalog; featured pricing honest |
| **Listing** | Tour + stay PDP; `/tours/<uuid>` and `/stays/<uuid>` deep links |
| **Availability** | Public calendars count **paid** occupancy (+ live holds at checkout), not failed/refunded attempts |
| **Checkout** | Stripe **TEST** sessions; inventory assert from paid + live holds |
| **Booking** | Paid confirmation surfaces Trips as durable receipt |
| **Trips** | Upcoming/Past/Cancelled honesty; Refund due; load vs action errors separated |
| **Cancellation** | Self-cancel is cancel (not “request”); success toast; Refund due when unpaid refund |
| **Account** | Settings/forms say submit, not fake “sent” |
| **Mobile** | Same routes; no separate overnight mobile redesign |

---

## 7. SUPPLIER FLOW STATUS

| Area | Status |
|---|---|
| **Onboarding** | Payouts stay manual until enabled; no instant-live promise |
| **Listings** | Publish needs verification; Publish title honesty |
| **Availability** | Partner calendar occupancy from paid + holds |
| **Bookings** | Failed checkouts out of live lists; Refund due chips/CSV |
| **Cancellations** | Request/accept paths; no auto-refund implication |
| **Ledger / Money** | Collected ≠ paid out; threshold ≠ queued transfer; negative ≠ next payout |
| **Account / Inbox** | Guest message Inbox vs details; notify copy durable to Bookings/Trips |
| **Mobile** | Partner UI responsive; no separate redesign |

---

## 8. NEW IMPROVEMENTS BUILT

Shipped (not planned):

- Supplier-fault **-€20** and force-majeure **€0** accounting with idempotent accept
- Paid booking **earnings** so fees can be offset in the ledger
- Inventory honesty: public + checkout + partner calendars use paid (+ live holds), not stale `booked` / failed checkouts
- Deep links `/tours/<uuid>`, `/stays/<uuid>`
- **Refund due** as the honest unpaid-cancel payment label across Trips, Bookings, Inbox, CSVs, notifies
- Email/notify copy points at **Trips/Bookings** as durable truth while Resend is blocked
- Money UI: collected balance, paid-out ≠ collected, empty/load/filter/threshold/negative honesty
- Partner onboarding / publish / landing “Get paid” honesty
- Traveler cancel CTA/toast and Trips load≠action error separation
- Amenity label casing; hide machine checkout notes from guest/partner views

---

## 9. DEFECTS DISCOVERED AND FIXED

Examples (not exhaustive):

| Root cause | Correction | Verification |
|---|---|---|
| Paid bookings never wrote `booking_earnings` | Webhook records earnings; unique `(kind, source_id)` | #21 +€189 offsets -€20 |
| UI implied Stripe auto-refund on supplier cancel | Honest Refund due + manual SOP docs | #19/#20 still `charge_refunded false` |
| Failed/pending checkouts counted as sold/Upcoming | Trip views + migrations 057–059 + edge occupancy | Calendars / Upcoming proofs |
| `listing_availability.booked` treated as occupancy | Paid+holds occupancy helpers | Stay Oct available; Sept 20–21 occupied |
| Lifecycle UI implied email as confirmation | Trips durable; Resend failure not “sent” | Function still 500 without valid key |
| Money copy said paid out / next payout when only collected | Labels + CSV “Not paid out” | Unit + UI copy tests |
| Cancel / message errors said “send” | submit/post humanize | `userFacingError` + copy tests |

---

## 10. REMAINING ISSUES

**P0**  
- None for marketplace core on TEST Stripe (book/pay/operate/ledger).

**P1**  
- Replace invalid **`RESEND_API_KEY`** and prove one real inbox delivery.  
- Founder **manual refund SOP** for cancelled paid bookings **#19** and **#20** (and any other Refund due) — auto-refund stays OFF.

**P2**  
- Auth SMTP “email sent” paths (leave alone unless founder wants Auth provider work).  
- Admin “Send to everyone” wording nit (not overnight-critical).

**P3**  
- Further copy nits only if a real honesty gap appears; do not invent busywork.

---

## 11. FOUNDER ACTION REQUIRED

1. **Replace `RESEND_API_KEY`** in Supabase secrets with a valid Resend key; re-trigger `notify-customer-booking` and confirm inbox.  
2. **Manual refunds** for Refund due bookings (#19/#20 at minimum) per `docs/MANUAL_REFUND.md` when ready.  
3. **Do not** turn on live Stripe, auto-accept, or auto-refund until email + refund ops are trusted.

---

## 12. SAFETY ASSERTIONS

- **Stripe = TEST**  
- **Live payments = OFF**  
- **Auto-accept = OFF**  
- **Auto-refund = OFF**  
- **Bookings #5 / #6 = UNTOUCHED** (`ea034bfa-…` tour, `db72b22c-…` stay)  

---

## 13. COMMITS

100 commits on `main` from `c9dac63` → `96fc962` (newest first):

```
96fc962 Trips action errors are not Trips unavailable; accept/decline feedback.
14fe892 Traveler cancel success shows Refund due honesty; Listings Publish title.
53a12a4 Traveler cancel is cancel, not a request; publish needs verify.
dafa42f Negative Money balance is not a queued next payout.
8d9a066 Restore checkout hold humanize test next to send→post map.
678f4d6 Money threshold progress is not a queued transfer.
e9f775a Money hero is collected balance, not pending payout.
986d66b Money errors say Money not payouts; Trips pickup waits on host.
71dee44 Cancel modal submit≠send; landing Get paid stays manual.
f67c270 Booking thread and cancel failures say post/submit, not send.
39893cb Split guest_message notify: Inbox vs details; publish needs verify.
f2621e5 Money empty is collected not payouts; forms submit not send.
6086749 Contact says received not sent; Money paid-out ≠ collected.
213816e Publish needs verification — drop “when you are ready”.
ba721eb Honest partner onboarding: payouts stay manual until enabled.
a2e3214 Call Money totals collected, not paid out; Trips is receipt truth.
… (through) …
7c22b3f Stop implying supplier cancellation auto-refunds via Stripe.
```

Full list: `git log --oneline c9dac6336f3c8c03bbbd1a6a8b0714585085510a..96fc962e9f5782f06006065426de6123496d28a2`

---

## 14. WHAT TRAVERION CAN ACTUALLY DO NOW

A traveler can find tours/stays, see capacity that matches paid inventory, check out on **Stripe TEST**, and manage trips with honest payment/cancel labels. A partner can operate listings, calendars, bookings, cancellations, and a ledger that records fees and later earnings without inventing payouts. Refunds remain a **manual** founder/ops step. Lifecycle email is **wired but blocked** until Resend accepts a valid API key; the product no longer pretends those emails landed.

---

## 15. SINGLE HIGHEST-ROI NEXT ACTION

**Replace the invalid `RESEND_API_KEY` and prove one real transactional email in the inbox** — then travelers and partners get the last missing trust signal without turning on live money.

---

*Overnight stop: Phase 102. No further agent loop armed. Do not invent Resend or live Stripe.*
