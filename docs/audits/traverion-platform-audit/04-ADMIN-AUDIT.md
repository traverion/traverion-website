# 04 — Admin Audit

**Hosts:** `admin.traverion.com` (staff login + dashboard). Marketing `/admin` redirects away. Localhost may expose gate.  
**Auth model:** `app_metadata.role === 'admin'` + `public.admin` allowlist RPC + edge `assertAdmin` (verified email, sole admin row checks).  
**Runtime:** Admin UI **NOT VERIFIED** in this session.

---

## A. Dashboard / overview

| Feature | Status | Notes |
|---------|--------|-------|
| Command-center stats | IMPLEMENTED/UNVERIFIED | AdminShell overview |
| Alerts / pending actions | PARTIAL | Verification queues; not a full ops incident system |

---

## B. Tabs / capabilities (`AdminShell`)

| Tab / capability | Status | Severity |
|------------------|--------|----------|
| Bookings + drawer | IMPLEMENTED/UNVERIFIED | P1 |
| Listings moderation / force unpublish | IMPLEMENTED/UNVERIFIED | P1 |
| Supplier verification (business + payout) | IMPLEMENTED/UNVERIFIED | P0 |
| Past verifications | IMPLEMENTED/UNVERIFIED | P2 |
| Finance summary / record payout | IMPLEMENTED/UNVERIFIED | P1 |
| Commercial (terms, periods, holds, refund instruction) | IMPLEMENTED/UNVERIFIED | P1 |
| Suppliers directory / customers / users | IMPLEMENTED/UNVERIFIED | P2 |
| Contact inquiries | IMPLEMENTED/UNVERIFIED | P2 |
| Content reports / hide review | IMPLEMENTED/UNVERIFIED | P1 |
| Portal messages | IMPLEMENTED/UNVERIFIED | P2 |
| System / marketplace wipe | IMPLEMENTED/UNVERIFIED | P0 risk if misused |

---

## C. Authorization

| Check | Status | Evidence |
|-------|--------|----------|
| Hidden UI alone insufficient | Mitigated in code | Edge `assertAdmin` + RPC |
| Client can call admin edge without role | Should fail | NOT VERIFIED runtime |
| RLS blocks traveler from admin tables | IMPLEMENTED/UNVERIFIED | `038_traverion_admin_table.sql` pattern |
| Audit trail of admin actions | PARTIAL | Payment/booking events exist; not a full SOC2 audit product |

**Rule:** A hidden admin button is not an authorization boundary — Traverion’s edge assert pattern is the correct direction; prove it in TEST.

---

## D. Financial admin

| Feature | Status | Severity | Notes |
|---------|--------|----------|-------|
| See Stripe-aligned booking payment states | IMPLEMENTED/UNVERIFIED | P0 | |
| Prepare refund instruction | IMPLEMENTED/UNVERIFIED | P1 | Does **not** execute Stripe refund (tests assert) |
| Record payout | IMPLEMENTED/UNVERIFIED | P1 | Manual |
| Gap vs Stripe Dashboard | PARTIAL | P1 | Reconciliation is operational process, not full automation |

---

## E. Support & trust

| Feature | Status | Notes |
|---------|--------|-------|
| Inquiries | IMPLEMENTED/UNVERIFIED | |
| Content reports | IMPLEMENTED/UNVERIFIED | mig 237 era |
| Disputes CRM | PARTIAL | Dispute webhook handlers exist; not a full support desk |
| Escalation playbooks | MISSING in product | Docs/process outside app |

---

## Admin completion estimate

- **Code coverage:** ~80% of needed control-center surfaces for early marketplace  
- **Verified this audit:** ~0%  
- **Highest risk:** privileged wipe, payout recording honesty, verification queue correctness  
