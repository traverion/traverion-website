# P9.15 — Full Supplier Reset & Fresh Onboarding Test (Assessment Only)

**Status:** Assessment complete. **No deletion executed.**  
**Project:** production `xcopqllkulxfkpunetbc`  
**Target email:** `contact@royalnordic.fi`  
**Verdict:** **NO-GO** for wipe / Auth delete of this identity.

---

## 1. Exact IDs

| Entity | ID / value |
|--------|------------|
| Auth user | `9e42bd3a-e72c-4472-bb7e-e8c3a59e2c18` |
| Email | `contact@royalnordic.fi` |
| Identity provider | `email` only (`identity` `0b49aaf4-4288-4e62-a375-14004580a570`) |
| Supplier profile ID | **same UUID** (supplier_id = auth user id) |
| Display name | Royal Nordic |
| Legal name | EM Global Oy |
| Business registration | `3567289-4` |
| Business verification | `verified` (submitted 2026-10-07) |
| Payout verification | `verified` |
| LIVE Express account | `acct_1UcAxbCOlSVGqrHJ` (`connect_account_livemode=true`, type `express`) |
| Legacy Connect account | `acct_1UcBXT2FvgTkBmd2` |
| Team membership | owner self (`supplier_team_members` 1 row) |
| Admin table | not present for this email |

**Related but separate identity (do not treat as RN disposable):**

| Entity | ID |
|--------|-----|
| Auth `info.traverion@gmail.com` | `22217025-f1bc-4e80-93d3-6b9b918a4629` |
| Pending profile “EM Global Oy” | same UUID, `verification_status=pending`, no Stripe account |

---

## 2. Dependency inventory (row counts)

Resolved via `supplier_id = 9e42bd3a-…` and listing joins (bookings have no direct `supplier_id`).

| Table / area | Rows | Notes |
|--------------|------|-------|
| `supplier_profiles` | 1 | LIVE Express mapped |
| `supplier_team_members` | 1 | owner = self |
| `listings` | 3 | all `published` |
| `bookings` (via listings) | **26** | see breakdown |
| `booking_commercial_snapshots` | 10 | |
| `booking_refund_instructions` | 3 | all `succeeded` |
| `booking_financial_holds` | 0 | |
| `supplier_earning_items` | **10** | eligible 5 / pending 2 / reversed 3; sum amounts 85 232 minor on non-reversed |
| `supplier_ledger_entries` | **32** | |
| `financial_audit_log` | **11** | by `supplier_id` |
| `supplier_commercial_terms` | 1 | STANDARD 15% monthly, active |
| `supplier_payout_pilot_selections` | 2 | `p81_rn_first_live` (selected + excluded) |
| `supplier_payout_reconciliation_events` | 2 | Connect updates for both acct IDs |
| `supplier_payout_periods` | 0 | |
| `supplier_transfer_attempts` | 0 | |
| `supplier_bank_payout_attempts` | 0 | |
| `live_custom_onboarding_allowlist` | 0 (global) | |
| `live_accounts_v2_pilot_approvals` | 0 | for this supplier and global |
| `partner_support_requests` | 2 | ops tickets + 1 PDF attachment |
| `supplier_activity_notifications` | 1 | |
| `listing_availability` | 0 | |
| `rental_availability_blocks` | 0 | |
| Storage `listing-images` | 18 | owner/path linked |
| Storage `supplier-verification` | 1 | |
| Storage `supplier-logos` | 1 | |
| Dedicated agreement/claim tables | none found | |

### Listings

| Listing ID | Title | Bookings |
|------------|-------|----------|
| `ddf096fb-2dea-4f59-965f-3cd31907cf03` | Northern Lights Guarantee… | 10 |
| `e21b231b-392a-4912-ba7f-07f7b181a564` | Arctic Aurora Apartment | 13 |
| `c5021087-cb67-4482-ba2c-f3f6dabf9903` | Sony A7 IV | 3 |

### Bookings by payment/status

| payment_status | status | n | sum_paid (EUR) |
|----------------|--------|---|----------------|
| paid | confirmed | 8 | 883.72 |
| paid | cancelled | 1 | 119.00 |
| refunded | cancelled | 7 | 195.50 |
| failed | pending | 9 | 0 |
| failed | cancelled | 1 | 0 |

**Guest mix:** 19 bookings `mirov.vesterinen@gmail.com`; 6 cert/e2e-style emails; 1 `review-notify-e2e@…`. Operator-driven testing dominates, but **paid + refunded money and Stripe refunds exist** → treat financial layer as retention, not disposable demo wipe.

### Paid references (examples)

`TV-EUX46NHT`, `TV-PDTAS6JD`, `TV-9NNEK3EZ`, `TV-UJGGRK54`, `TV-5BX6P3WQ`, `TV-EMHBUJNT`, `TV-8AA59YXN`, `TV-FNFQEA87`, `TV-ED3VFQYA`.

### Pilot selection

- Selected: `TV-FNFQEA87` (€85) — “no READY period / no transfer”
- Excluded: `TV-PDTAS6JD` (retained cancel) — excluded until explicit approval

---

## 3. Classification

| Class | What |
|-------|------|
| **1. Disposable TEST/demo (partial)** | Failed unpaid bookings; cert@ / review-e2e guest rows; some support ticket noise. Disposable **only if** detached from paid/refund/earning chains — prefer leave in place. |
| **2. Genuine LIVE commercial** | Published listings; paid confirmed bookings; supplier profile; LIVE Express mapping; pilot selections; storage assets for live listings. |
| **3. Financial / compliance retention** | `supplier_earning_items`, `supplier_ledger_entries`, `financial_audit_log`, `booking_refund_instructions` (+ Stripe refund IDs), `booking_commercial_snapshots`, `supplier_commercial_terms`, Connect reconciliation events, verification document storage. |
| **4. Shared / other supplier** | Pending “EM Global Oy” profile under `info.traverion@gmail.com` — **out of scope**; do not delete. Guest customers are shared marketplace identities. |
| **5. Uncertain** | Whether every `mirov.vesterinen@gmail.com` paid booking is “demo” vs commercial practice — **does not matter**: money movement + refunds force retention. |

**Never assume disposable because of this email.** Classification is driven by payment/refund/earning/Stripe evidence.

---

## 4. Deletion / preservation matrix

| Record | Proposed action |
|--------|-----------------|
| Auth user `9e42bd3a…` | **PRESERVE** (or email-archive only under separate approved plan) |
| `supplier_profiles` RN | **PRESERVE / soft-archive** — do not hard delete |
| Stripe `acct_1UcAxbCOlSVGqrHJ` | **DO NOT** delete, close, disconnect, or migrate |
| Legacy `acct_1UcBXT2FvgTkBmd2` | **PRESERVE** mapping for reconciliation |
| Listings (3) | **PRESERVE** (or unpublish if product wants hide; not delete) |
| Paid / refunded bookings | **PRESERVE** |
| Failed unpaid bookings | Optional later cleanup; **not required** for fresh onboarding |
| Earning items / ledger / audit | **PRESERVE** |
| Refund instructions | **PRESERVE** |
| Pilot selections / reconciliation | **PRESERVE** |
| Commercial terms | **PRESERVE** |
| Team membership | Keep with archived supplier |
| Support requests / notifications | Archive OK; low value |
| Storage objects | Keep while listings/verification retained |
| Allowlist / LIVE create gate | Leave **empty / OFF** |

---

## 5. Cleanup script status

**No safe full-deletion script for this supplier.** Confirmed LIVE financial + Stripe mapping blocks wipe.

If a future mission needs **optional disposable-only** cleanup (failed unpaid bookings with no earning/refund links), that must be a **separate, booking-ID-scoped** script after explicit approval — not Auth/supplier/Stripe deletion.

Placeholder (DO NOT RUN without approval; incomplete by design):

```sql
-- P9.15 OPTIONAL disposable booking prune — NOT APPROVED
-- Scope ONLY failed unpaid bookings with zero earnings/refunds/ledger.
-- NEVER touch supplier_profiles, auth.users, or stripe_connected_account_id.
-- BEGIN;
-- ... booking_id IN (<explicit uuid list>) ...
-- ROLLBACK; -- default
```

---

## 6. Auth reset feasibility

| Question | Finding |
|----------|---------|
| Can we delete Auth user now? | **No** (mission forbids; also unsafe) |
| Other Traverion admin roles? | No `admin` row for this email |
| Other supplier memberships? | Only owner of own supplier |
| Historical attribution? | `supplier_id` / `actor` / team / support submitter = this UUID throughout financial history |
| Free `contact@royalnordic.fi` for re-register? | Requires either (A) **new email** for test, or (B) approved **email rename** of existing Auth user to an archive address **after** soft-archiving supplier + documenting Stripe mapping ownership — then create a **new** Auth user + supplier. Option B still leaves old UUID and financial graph intact. |

**Recommendation:** Do **not** delete Auth. For a completely fresh journey, use a **new test identity** (e.g. `rn-onboarding+p915@…` or plus-address under Traverion ops). Keep Royal Nordic LIVE account untouched.

---

## 7. Stripe account safety (Phase 4)

- LIVE Express `acct_1UcAxbCOlSVGqrHJ` — **unchanged**.
- Do not create replacement LIVE account.
- Do not clear `stripe_connected_account_id` without archival/reconciliation plan.
- Express remains ineligible for Accounts v2 pilot path per P9.11–P9.13; new TEST Custom/recipient identity is the correct onboarding vehicle.

---

## 8. Fresh onboarding test checklist

Use a **new Auth + supplier** in **TEST** first. LIVE Accounts v2 steps require **separate written authorization** (gate + allowlist).

| # | Step | TEST | LIVE |
|---|------|------|------|
| 1 | New account registration | Yes | Separate auth |
| 2 | Email confirmation | Yes | Separate auth |
| 3 | Business profile completion | Yes | Separate auth |
| 4 | Admin business approval | Yes (staging/prod admin) | Yes |
| 5 | Pilot eligibility | Yes (TEST flags) | Requires eligibility + allowlist |
| 6 | Accounts v2 creation | Yes (TEST mode) | **Gate OFF today — needs auth** |
| 7 | Native representative | Yes | Needs LIVE account |
| 8 | Identity verification | Yes (TEST docs) | LIVE KYC |
| 9 | Secure bank collection | Yes | LIVE bank |
| 10 | Payout preferences | Yes | LIVE |
| 11 | Agreement acceptance | Yes | LIVE |
| 12 | Review / verification status | Yes | LIVE |
| 13 | Save/resume each step | Yes | Yes |
| 14 | Desktop + mobile | Yes | Yes |
| 15 | Webhook sync | Yes (TEST webhook endpoint) | LIVE webhook endpoint |

---

## 9. Production safety readback (verified)

| Flag | value_int |
|------|-----------|
| `live_custom_onboarding_enabled` | **0** |
| `live_custom_onboarding_allowlist` | **empty** |
| `payout_execution_enabled` | **0** |
| `payout_auto_prepare_enabled` | **0** |
| `payout_pilot_prepare_enabled` | **0** |
| `stripe_connect_transfers_enabled` | **0** |

No LIVE transfers/payouts executed in this assessment. No Auth/supplier/Stripe mutations performed.

---

## 10. GO / NO-GO

| Decision | Scope |
|----------|--------|
| **NO-GO** | Full supplier reset / Auth delete / Stripe disconnect for `contact@royalnordic.fi` |
| **NO-GO** | Treating all RN bookings as disposable wipe candidates |
| **GO** | Fresh end-to-end onboarding on a **new test identity** in TEST |
| **GO (later)** | Soft-archive RN + email rename plan **only** after explicit approval, preserving financial/Stripe mapping |
| **HOLD** | Any LIVE Accounts v2 create for a new pilot until gate/allowlist mission |

**How to get a fresh registration experience while preserving history:** keep Royal Nordic as-is (or soft-archive); register a dedicated onboarding test supplier; run the full journey there. Do not recycle `contact@royalnordic.fi` until an approved archival email-release procedure exists.

---

*P9.15 assessment only — stop before deletion.*
