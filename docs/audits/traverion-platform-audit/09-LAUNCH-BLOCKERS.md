# 09 — Launch Blockers

Prioritized issues preventing **safe real-customer / LIVE** operation.  
Distinguish **CONFIRMED** (code/design) vs **UNVERIFIED RISK** (needs runtime proof).

---

## P0 — Critical

### LB-001 — LIVE Stripe / real money not enabled (intentional)
- **Severity:** P0  
- **Area:** Payments  
- **Problem:** Payment edges reject LIVE secrets; platform is TEST-oriented.  
- **Impact:** Cannot take real charges until LIVE program completes.  
- **Evidence:** Edge Stripe TEST-only guards; founder readiness docs.  
- **Type:** CONFIRMED (safety lock)  
- **Solution:** Separate LIVE launch program: keys, webhook endpoints, reconciliation, legal MoR, monitoring.  
- **Acceptance:** LIVE checkout in staging sandbox policy + runbooks; never accidental LIVE in preview.

### LB-002 — Guest/host cancel does not auto-execute Stripe refunds
- **Severity:** P0/P1  
- **Area:** Refunds / finance  
- **Problem:** Cancel sets Refund due / prepares instruction; Stripe money movement is manual.  
- **Impact:** Customers may wait; ops error risk; trust damage.  
- **Evidence:** mig 241/256; admin tests forbid stripe.refunds.create.  
- **Type:** CONFIRMED  
- **Solution:** Ops playbook now; later execute-refund worker with idempotency.  
- **Acceptance:** Documented SLA + tested manual path; ledger matches Stripe after refund webhook.

### LB-003 — Email delivery not proven in this audit
- **Severity:** P0  
- **Area:** Notifications  
- **Problem:** Transactional pipeline exists; mailbox delivery unverified here.  
- **Impact:** Suppliers miss bookings; travelers miss confirmations.  
- **Evidence:** notify-* functions; prior “NOT EXTERNALLY VERIFIED”.  
- **Type:** UNVERIFIED RISK (likely wired)  
- **Solution:** Send TEST bookings; capture Resend dashboard + inbox screenshots.  
- **Acceptance:** Paid/cancel/message emails received for customer+supplier.

### LB-004 — Stay R2B must be certified before offering Request-to-Book publicly
- **Severity:** P0  
- **Area:** Stay bookings  
- **Problem:** Complex authorize/capture/expire path; capture-finalize gap exists.  
- **Impact:** Double inventory, stranded authorizations, angry hosts/guests.  
- **Evidence:** stay-booking-request-action; promote finalize recovery comments.  
- **Type:** UNVERIFIED RISK (code COMPLETE)  
- **Solution:** Execute T4–T7 matrix on Stripe TEST.  
- **Acceptance:** Accept/decline/expire/withdraw all leave consistent booking+PI+calendar.

### LB-005 — Concurrent Instant Book correctness must be proven
- **Severity:** P0  
- **Area:** Inventory  
- **Problem:** Design allows racing checkouts; first promote wins.  
- **Impact:** Wrong refunds or oversell if promote/refund fails.  
- **Evidence:** mig 257; promote conflict refund paths.  
- **Type:** UNVERIFIED RISK  
- **Solution:** Two-browser same-night TEST; assert one paid, one refunded.  
- **Acceptance:** No double occupy; both travelers see honest states.

### LB-006 — Admin allowlist / privileged wipe misuse
- **Severity:** P0  
- **Area:** Admin security  
- **Problem:** Marketplace wipe and finance actions are powerful.  
- **Impact:** Data loss / incorrect payouts.  
- **Evidence:** AdminShell system actions; assertAdmin pattern.  
- **Type:** UNVERIFIED RISK (controls coded)  
- **Solution:** Confirm only founder in `public.admin`; runbook; disable wipe in prod or dual-control.  
- **Acceptance:** Unauthorized JWT cannot invoke admin edge; wipe requires explicit procedure.

---

## P1 — Launch blockers / major ops

### LB-007 — Commercial take-rate & payout architecture undecided for LIVE
- **Severity:** P1  
- **Area:** Finance  
- **Problem:** 0% MoR / manual payouts OK for demo, not for scale LIVE.  
- **Type:** CONFIRMED commercial gap  
- **Solution:** Decide commission + Connect vs manual; implement before LIVE.  
- **Acceptance:** Written commercial policy + matching ledger behavior.

### LB-008 — Cron jobs production configuration
- **Severity:** P1  
- **Area:** Infra  
- **Problem:** Workflows exist; GH secrets/schedule effectiveness unknown here.  
- **Type:** UNVERIFIED RISK  
- **Solution:** Verify Actions history; alert on failure.  
- **Acceptance:** R2B expiry and reminders observed in TEST.

### LB-009 — Partner golden path not re-verified this audit
- **Severity:** P1  
- **Area:** Supplier  
- **Problem:** Onboarding→publish→receive booking not exercised here.  
- **Type:** UNVERIFIED RISK  
- **Solution:** Run supplier #1 TEST script end-to-end.  
- **Acceptance:** New supplier publishes tour+stay; receives booking; sees pickup/earnings.

### LB-010 — Legal/trust pages accuracy
- **Severity:** P1  
- **Area:** Compliance  
- **Problem:** Pages exist; legal correctness is owner review.  
- **Type:** UNVERIFIED  
- **Solution:** Lawyer/founder review Privacy/Terms/Legal Notice.  
- **Acceptance:** Signed-off copies on production.

### LB-011 — Money UI contract drift
- **Severity:** P1/P2  
- **Area:** Supplier earnings  
- **Problem:** `commercial-money-engine-v1.test.ts` failed expecting “Eligible for next payout”.  
- **Type:** CONFIRMED (test fail 2026-10-22)  
- **Solution:** Align UI copy with test or update test to current honest copy.  
- **Acceptance:** Vitest file green; earnings page non-misleading.

---

## Non-blockers (explicit)

- Blog empty, Experiences placeholder, Rentals unavailable, Team invites Coming Soon, multi-unit stays unpublished — **acceptable** if not marketed as available.  
- Cart soft-retire — OK if Trips is primary; clean residual copy later (P2).  
