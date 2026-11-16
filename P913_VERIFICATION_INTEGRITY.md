# P9.13 — Supplier verification integrity and pilot readiness

**Date:** 2026-11-17  
**Admin function:** `admin-supplier-verification` version **62**  
**Onboarding function:** `connect-supplier-onboarding` version **30**  
**Verdict:** **NO-GO** for selecting a real pilot supplier.

No historical verification was revoked. No pilot supplier was approved or allowlisted. No LIVE Accounts v2 account was created. The creation gate stayed **0**. Payout flags stayed **OFF**.

## 1. Verification integrity findings

### Incomplete “verified” supplier `c2dd731a-3001-4bc2-b8ea-7f7dc1ceae09`

| Question | Finding |
| --- | --- |
| How verified was assigned | Service-role SQL in `.tmp/p09-15-live-020-cert/prep-050.mjs` set `verification_status = 'verified'` (and payout verified) for a disposable LIVE €0.50 cert supplier. Client RLS does not allow self-write of verified; service role bypasses that. |
| Predates current requirements? | Yes. The row has no `verification_submitted_at`, no registration document, no legal name, no country, no business type, no phone. It predates P9.12/P9.13 completeness and genuine-evidence rules. |
| Admin / DB bypass? | Admin `approve_business` was not the source. Direct SQL via service role is the bypass path used by cert tooling. |
| Left unchanged? | Yes. Status remains `verified` for separate review; not revoked in this mission. |

### Other verified suppliers

Production currently has **two** `verification_status = 'verified'` rows:

| Supplier | Genuine evidence | Notes |
| --- | --- | --- |
| Royal Nordic `9e42bd3a-…` | Yes (`verification_submitted_at` + registration document) | LIVE Express `acct_1UcAxbCOlSVGqrHJ` preserved. Missing `contact_phone` for new-approval / pilot phone rule. |
| `c2dd731a-…` | **No** | Cert SQL verified shell; incomplete legal profile. |

### Safeguards added (forward-looking)

- `getBusinessApprovalBlockers` blocks **new** `approve_business` when legal name, country, type, phone, address, registration id/doc, or submission trail is missing.
- Already-verified suppliers hit `already_verified` and are left unchanged.
- Pilot eligibility requires `hasGenuineBusinessVerificationEvidence` (submitted_at **or** registration document). Fake verified without trail is ineligible.

## 2. Registration improvements

Partner Business settings (`BusinessProfilePage`) now:

- Shows **Profile progress** (`N of M required`) with explicit missing items.
- Requires legal business name, explicit country select (Finland listed), company/individual type, contact phone, and owner/authorized-representative confirmation before **Save & submit for review**.
- Keeps Save & submit disabled until the profile is ready for review.

`supplierOnboarding` missing-reason helpers include `contact_phone`.

## 3. Approval safeguard results

| Check | Result |
| --- | --- |
| New incomplete approval | Blocked by `getBusinessApprovalBlockers` in `admin-supplier-verification` v62 |
| Already verified | Unchanged (`already_verified`) |
| Unit tests | `supplier-business-approval.test.ts` + eligibility + onboarding: **12 passed** |
| Historical rows | Not rewritten |

## 4. Pilot eligibility integration

Pilot assessment still uses `assessLiveAccountsV2PilotEligibility` and remains **separate** from gate / allowlist activation.

Against production-shaped snapshots:

| Supplier | Eligible? | Key problems |
| --- | --- | --- |
| `c2dd731a-…` | No | Non-genuine verified; missing FI/legal/type/phone; owner + Stripe ack required |
| Royal Nordic | No | Existing Express connected account; missing phone |

Admin UI (`AdminLiveV2PilotPanel`) can assess without approving. This mission did **not** call `approve_live_v2_pilot`. Staff admin host login was not completed in-browser (private Continue gate); assessment certified via shared assessor + deployed admin function path.

## 5. Desktop / mobile browser certification

Local Vite `http://127.0.0.1:5197` with staging partner `p97-v2-…@partner-demo.traverion.invalid`:

| Surface | Result |
| --- | --- |
| Desktop `/partner/business-profile` | Progress **6 of 8**; missing document + owner confirmation; **Save & submit for review** disabled |
| Mobile 390×844 | Same progress card and missing guidance; bottom nav intact |
| `/partner/verification` payout wizard | Opens Business information step; incomplete suppliers are guided through setup; LIVE create remains gated at 0 / empty allowlist |

Screenshots: `p913-business-profile-desktop.png`, `p913-business-profile-mobile.png` (session artifacts).

## 6. Existing inconsistent-profile report

| Id | Display | Status | Issue | Action this mission |
| --- | --- | --- | --- | --- |
| `c2dd731a-3001-4bc2-b8ea-7f7dc1ceae09` | (null) | verified | No legal details / submission trail; cert SQL | Left as-is |
| `9e42bd3a-e72c-4472-bb7e-e8c3a59e2c18` | Royal Nordic | verified | Genuine evidence; missing phone; Express LIVE | Left as-is |
| `22217025-f1bc-4e80-93d3-6b9b918a4629` | EM Global Oy (per P9.12) | not verified pilot-ready | Incomplete; possible RN legal-name collision | Not modified |

## 7. Production safety readback

| Control | Value |
| --- | --- |
| `live_custom_onboarding_enabled` | **0** |
| `live_custom_onboarding_allowlist` | **0** rows |
| `live_accounts_v2_pilot_approvals` | **0** |
| Royal Nordic Express | `acct_1UcAxbCOlSVGqrHJ` preserved |
| LIVE Accounts v2 connected accounts | **0** |
| LIVE connected accounts (any) | **1** (RN Express only) |
| READY payout periods | **0** |
| Transfer attempts | **0** |
| `payout_execution_enabled` | **0** |
| `payout_auto_prepare_enabled` | **0** |
| `payout_pilot_prepare_enabled` | **0** |
| `stripe_connect_transfers_enabled` | **0** |
| Earning items | **11** / **85232** minor units |

## 8. GO / NO-GO

**NO-GO** for selecting a real LIVE Accounts v2 pilot supplier.

Reasons: no complete, genuinely verified, Finland-explicit supplier without an existing connected account; `c2dd` remains a non-genuine verified shell; Royal Nordic is Express and ineligible; creation gate and allowlist correctly remain inactive.

### Stop line

Verification integrity certification complete. Do not approve, allowlist, create LIVE accounts, enable payouts, or revoke historical verification without a separate mission.
