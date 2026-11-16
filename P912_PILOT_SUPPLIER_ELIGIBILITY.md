# P9.12 — Pilot supplier registration and eligibility

**Date:** 2026-11-17  
**Onboarding function:** `connect-supplier-onboarding` version 30  
**Admin function:** `admin-supplier-verification` version 61  
**Verdict:** **NO-GO** for selecting a real pilot supplier. No supplier was approved or allowlisted.

No LIVE account was created. The creation gate stayed 0. The allowlist stayed empty.

## 1. Registration and eligibility audit

Partners register at `/login` with a brand name, email, phone, and password. That creates an auth user and a `supplier_profiles` row. Legal name, country, and company/individual type are not collected at signup. They are collected later in partner business profile settings and in the payout setup wizard Business step. The wizard requires legal name, business type, address fields, and an explicit country code before Continue.

Traverion business approval is admin-only through `approve_business`. Suppliers are not auto-approved for LIVE financial onboarding. Business verification (`verification_status`) is separate from Connect account creation and from the LIVE creation allowlist.

## 2. Required fixes

| Fix | Change |
| --- | --- |
| Missing country | `finlandSupplierCountry('')` now returns null. LIVE and TEST create paths no longer default a blank country to FI. |
| Incomplete legal details | Pilot eligibility requires legal name, company/individual type, phone, and Traverion business verification. |
| Existing connected account | Linked, LIVE, or legacy connected accounts are rejected for the pilot. |
| Open create claim | A claim younger than two minutes without an account id blocks eligibility. |
| Ownership and Stripe acknowledgement | Admin must confirm owner authority and supplier acknowledgement of real Stripe verification. |
| Approval without allowlisting | New table `live_accounts_v2_pilot_approvals` plus admin actions that never set the gate or insert allowlist rows. |

Admin tab **LIVE v2 pilot** can assess a supplier id and, only with explicit checkboxes, record a pilot approval. That approval does not enable `live_custom_onboarding_enabled` and does not write `live_custom_onboarding_allowlist`.

## 3. Existing profile cleanup (manual review only)

No profile was deleted, merged, approved, or edited.

| Profile | Flags |
| --- | --- |
| `22217025-f1bc-4e80-93d3-6b9b918a4629` | Incomplete. Display name `EM Global Oy`, no legal name, no country, no business type, verification pending. Display name matches Royal Nordic’s legal name — possible duplicate entity. |
| `c2dd731a-3001-4bc2-b8ea-7f7dc1ceae09` | Incomplete. No display name, no legal name, no country, no business type. Verification is already `verified`, which should be reviewed before any financial onboarding. |
| Royal Nordic `9e42bd3a-…` | Ineligible. LIVE Express `acct_1UcAxbCOlSVGqrHJ` remains linked. |
| Orphan team memberships | 2 rows whose `supplier_id` has no `supplier_profiles` row. They were listed for review and not reassigned. |

## 4. Pilot approval workflow

1. Supplier registers and completes legal name, Finland country, business type, and contact phone.
2. Admin approves Traverion business verification when documents and ownership are acceptable.
3. Admin opens **LIVE v2 pilot**, pastes the supplier id, and runs Assess.
4. Admin checks owner authority, Stripe verification acknowledgement, and the explicit “record approval only” confirmation.
5. `approve_live_v2_pilot` stores the approval and a `financial_audit_log` row. Gate remains OFF. Allowlist remains empty.
6. A later, separately authorized mission is still required before any allowlist insert or gate change.

Duplicate legal-entity review flags block approval until resolved.

## 5. Certification

| Check | Result |
| --- | --- |
| Missing country rejected | PASS — empty country is null; create and eligibility fail closed |
| Incomplete legal details rejected | PASS |
| Existing connected accounts rejected | PASS |
| Unauthorized supplier access | PASS — admin actions require Traverion admin JWT; allowlist remains service-role only |
| Duplicate entities flagged | PASS — review flag; approval refused while the flag remains |
| Approved suppliers blocked while gate OFF | PASS — approval does not allowlist; create still requires gate 1 and allowlist row |
| Express suppliers unchanged | PASS — Royal Nordic Express mapping untouched |

No supplier was approved in this mission.

## 6. Production safety

| Check | Result |
| --- | --- |
| LIVE creation gate | 0 |
| Allowlist | 0 |
| Pilot approvals | 0 |
| Royal Nordic | Express `acct_1UcAxbCOlSVGqrHJ`, livemode true |
| Payout flags | all 0 |
| Earnings | 11 items, 85232 minor units |
| READY periods / transfers | 0 / 0 |

## 7. Recommendation

**NO-GO** for selecting a real pilot supplier.

Registration can create a profile, and the eligibility and approval workflow are in place, but no complete, approved Finnish supplier without a connected account is ready. Clean up or complete the two incomplete profiles manually, then register or finish one genuine supplier before any allowlisting decision.
