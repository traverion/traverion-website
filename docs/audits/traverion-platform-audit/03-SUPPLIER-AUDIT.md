# 03 — Supplier Audit

**Shell:** `SupplierLayout` on `partner.traverion.com` / `/partner/*` (legacy `/supplier*` redirects).  
**Runtime:** Partner portal journeys **NOT VERIFIED** in this audit session (code-only).

---

## A. Auth & onboarding

| Feature | Status | Severity | Evidence |
|---------|--------|----------|----------|
| Partner signup / login | IMPLEMENTED/UNVERIFIED | P1 | `SupplierAuth` / `PartnerAuthPage` |
| Email verified flow | IMPLEMENTED/UNVERIFIED | P1 | Partner email verified page |
| Onboarding checklist | IMPLEMENTED/UNVERIFIED | P1 | `PartnerOnboarding`; profile completeness gates |
| Business verification submit | IMPLEMENTED/UNVERIFIED | P1 | Storage + profile; admin queue |
| Stripe Connect onboarding | MISSING / PARTIAL | P1 | Manual payout recording; no Connect product |
| Publish gate (verifications) | IMPLEMENTED/UNVERIFIED | P1 | `listingPublishGate` |
| Team roles | PARTIAL | P2 | Memberships + RLS; **invite UI Coming Soon** (`SupplierTeamPanel`) |

**Can a new supplier reach first published bookable listing independently?**  
**Code says yes** after business+payout verification approval + listing publish gates.  
**Runtime path NOT VERIFIED** this audit.

---

## B. Dashboard

| Feature | Status | Notes |
|---------|--------|-------|
| Overview metrics / quick actions | IMPLEMENTED/UNVERIFIED | `SupplierDashboard` |
| Empty states | IMPLEMENTED/UNVERIFIED | Present |
| Data accuracy | NOT VERIFIED | Depends on bookings/earnings queries |

Complexity: many partner sections (performance, discounts, reviews, pickup, dual tour/stay calendars). Operationally rich; risk of **dashboard overload** for first-time hosts (P3 UX).

---

## C. Listings management

| Feature | Status | Notes |
|---------|--------|-------|
| List / filter / status | IMPLEMENTED/UNVERIFIED | `SupplierListings` |
| Create chooser tour/stay | IMPLEMENTED/UNVERIFIED | `PartnerCreateListingPage` |
| Edit / unpublish | IMPLEMENTED/UNVERIFIED | Form + status updates |
| Multi-unit stay publish block | COMPLETE (intentional) | Cannot publish multi-unit yet |
| Rentals | UI ONLY | Explicitly unavailable |
| Row click vs View | IMPLEMENTED/UNVERIFIED | Prior UX work; runtime NOT VERIFIED |

---

## D. Tour creator

| Area | Status | Notes |
|------|--------|-------|
| Information / options / schedule / photos / policies | IMPLEMENTED/UNVERIFIED | `SupplierListingForm` + workspaces |
| Draft persistence | IMPLEMENTED/UNVERIFIED | Listing save |
| Publish validation | IMPLEMENTED/UNVERIFIED | Season/cutoff/capacity gates in SQL + client |
| Public PDP parity | IMPLEMENTED/UNVERIFIED | Must be TEST-certified |
| Known TS noise in schedule workspace | PARTIAL | Pre-existing tsc failures reported historically |

---

## E. Stay creator

| Area | Status | Severity | Notes |
|------|--------|----------|-------|
| Multi-screen onboarding | IMPLEMENTED/UNVERIFIED | — | `StayOnboardingFlow` |
| Location / map / amenities / rooms | IMPLEMENTED/UNVERIFIED | — | |
| Booking method Instant vs Request | IMPLEMENTED/UNVERIFIED | P1 | |
| Pricing / commission display | IMPLEMENTED/UNVERIFIED | P2 | Must stay 1-night honest |
| Property type vs accommodation options | IMPLEMENTED/UNVERIFIED | P1 | Prior bug class; tests exist (`stay-creator-consistency`) |
| Photos / rules / safety / cancel | IMPLEMENTED/UNVERIFIED | — | |
| Second booking system | Avoided in design | — | Uses shared bookings + stay nights |

---

## F. Supplier bookings

| Feature | Status | Notes |
|---------|--------|-------|
| Tours bookings desk | IMPLEMENTED/UNVERIFIED | `SupplierBookings` family=tour |
| Stay reservations desk | IMPLEMENTED/UNVERIFIED | family=stay |
| Status / filters / detail | IMPLEMENTED/UNVERIFIED | |
| Cancel / cancel-request flows | IMPLEMENTED/UNVERIFIED | Editor-role RPCs |
| R2B Accept/Decline | IMPLEMENTED/UNVERIFIED | `StayRequestActions` → edge; **client gated to Stripe TEST mode** |

---

## G. Meeting points & pickups

| Feature | Status | Severity | Notes |
|---------|--------|----------|-------|
| Pickup planner workspace | IMPLEMENTED/UNVERIFIED | P1 | `SupplierPickupPlanner`, `pickup-planner.ts` |
| Meeting-point bookings visible | IMPLEMENTED/UNVERIFIED | P0 ops | Fulfillment types distinguish meeting vs pickup |
| Confirm / change notify customer | IMPLEMENTED/UNVERIFIED | P1 | notify kinds pickup_* |
| Grouping by date/option | IMPLEMENTED/UNVERIFIED | — | Planner model |

**Do not treat meeting time as “missing” when configured** — code resolves snapshot→notes→option→listing (`pickup-completeness`). Runtime correctness NOT VERIFIED.

---

## H. Stay operations

| Feature | Status | Severity | Notes |
|---------|--------|----------|-------|
| Stay calendar | IMPLEMENTED/UNVERIFIED | P1 | `SupplierStayCalendar` |
| Blocked dates / availability | IMPLEMENTED/UNVERIFIED | — | |
| Instant Book ops | IMPLEMENTED/UNVERIFIED | — | Paid bookings appear after promote |
| Request-to-Book full loop | IMPLEMENTED/UNVERIFIED | P0 | Edge + expire cron present; **must TEST certify** |
| External calendar sync | MISSING | P2 | Not found |

---

## I. Finance

| Feature | Status | Severity | Notes |
|---------|--------|----------|-------|
| Earnings / ledger UI | IMPLEMENTED/UNVERIFIED | P1 | `SupplierEarnings` |
| Commission model | PARTIAL | P0 commercial | Platform MoR; historically 0% → supplier 100% of amount_paid |
| Payouts | PARTIAL | P1 | Manual admin record; no Connect auto-transfer |
| Refund adjustments | PARTIAL | P1 | Ledger reverse/shrink on Stripe refund webhook; guest cancel ≠ auto refund |
| Contract test drift | PARTIAL | P2 | `commercial-money-engine-v1.test.ts` failed “Eligible for next payout” |

---

## J. Communications & account

| Feature | Status | Notes |
|---------|--------|-------|
| Inbox threads | IMPLEMENTED/UNVERIFIED | Paid/messaging gates |
| Support form | IMPLEMENTED/UNVERIFIED | `PartnerSupportPage` |
| Business / account settings | IMPLEMENTED/UNVERIFIED | |
| Help page orphan | UI ONLY | `PartnerHelpPage.tsx` unused; support page used |
| Notifications email | IMPLEMENTED/UNVERIFIED | Soft-fail; delivery NOT VERIFIED |

---

## Supplier completion estimate

- **Code coverage:** ~85% of Tours+Stays operator needs for a single-supplier marketplace  
- **Verified this audit:** ~0% partner runtime  
- **Blockers to “supplier #1 happy”:** verification approve path, publish, receive TEST booking, pickup visibility, earnings honesty, email  
