# P9.34 — Complete LIVE Connect Pilot Prerequisites

| | |
|---|---|
| Verdict | **NO-GO** → stop at **APPROVAL REQUIRED** (prerequisites incomplete) |
| Supplier | `eced0f8c-c2e4-469b-8bba-15170be68cc1` (EM Global Oy) |
| Date | 2026-11-18 |
| Create / allowlist / money | **Not enabled** · transfers & payout execution remain **0** |

---

## Executive summary

Profile **fields** for EM Global Oy match the Finnish open Trade Register (YTJ). The uploaded “company registration” file does **not**: it is a **Royal Nordic marketing poster** (“Guaranteed Northern Lights Tour / Book Now”), not a PRH extract.

Business verification was **not** approved. LIVE v2 pilot approval was **not** recorded (would invent Stripe acknowledgement and is blocked until business is verified). Create gate and allowlist were not touched.

---

## 1. What was pending / missing

| Item | Status |
|---|---|
| Legal name, FI, company type, phone, address, Y-tunnus, VAT, director, submitted_at | Present — pass `getBusinessApprovalBlockers` structural checks |
| Registration document **path** | Present (`…/company-registration.png`, ~2.1 MB) |
| Registration document **content** | **FAIL** — marketing poster, not Trade Register extract |
| Traverion `verification_status` | Remains **`pending`** |
| Identity document | Not uploaded (not required for company business approval helpers) |
| `live_accounts_v2_pilot_approvals` | **0** |
| Owner / Stripe acknowledgement for pilot | **Not recorded** (must not invent) |

### YTJ corroboration (legitimate, public)

Source: `https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=3567289-4`

| Field | Profile | YTJ |
|---|---|---|
| Legal name | EM Global Oy | EM Global Oy |
| Business ID | 3567289-4 | 3567289-4 |
| Form | company | Osakeyhtiö / limited company |
| Address | Siljotie 2 D7, 96100 Rovaniemi | Siljotie 2 D 7, 96100 Rovaniemi |
| VAT | FI35672894 | VAT-liable for business activity (FI + id without hyphen) |

### Ownership

| Check | Result |
|---|---|
| Auth email | `contact@royalnordic.fi` (confirmed) |
| Team role | `owner`, user_id = supplier_id |
| Managing director listed | Miro Vesterinen |
| Duplicate EM Global / 3567289-4 profiles | None in current `supplier_profiles` |

---

## 2. Actions taken (no fabricated approval)

1. Audited profile + YTJ + downloaded registration object for visual review.
2. **Refused** `approve_business` — document evidence is not a registration extract.
3. Wrote supplier-facing `business_verification_feedback` (status stays `pending`) asking for an official PRH/YTJ extract.
4. Did **not** call `approve_live_v2_pilot` / invent Stripe acknowledgement.
5. Did **not** insert allowlist or set `live_custom_onboarding_enabled`.

---

## 3. LIVE v2 pilot approval — prepared, not executed

Required later (admin API only, after business is verified):

```text
action: approve_live_v2_pilot
supplierId: eced0f8c-c2e4-469b-8bba-15170be68cc1
ownerConfirmed: true          // only after human confirm
stripeVerificationAcknowledged: true  // only after human confirm
confirmLivePilot: true
```

Eligibility still fails today because `verification_status !== 'verified'`.

---

## 4. Safety reconfirm

| Control | Value |
|---|---|
| `live_custom_onboarding_enabled` | **0** |
| Allowlist | **empty** |
| Pilot approvals for this id | **0** |
| `payout_execution_enabled` | **0** |
| `stripe_connect_transfers_enabled` | **0** |
| Transfer executor LIVE hard-block | Still in code |
| Rollback | Gate → 0 + delete allowlist row (unchanged procedure from P9.33) |

LIVE secrets / webhook secrets remain present (unchanged from P9.33 audit).

---

## 5. Final GO / NO-GO

| Gate | Result |
|---|---|
| Structural profile completeness | PASS |
| Official registry identity match (YTJ) | PASS |
| Genuine registration document on file | **FAIL** |
| Traverion business verified | **FAIL** |
| LIVE v2 pilot approval + Stripe ack | **FAIL** (blocked + not invented) |
| Ready for allowlist / create | **NO-GO** |

### APPROVAL REQUIRED (next human steps)

1. Supplier uploads a real PRH/YTJ company extract for EM Global Oy (`3567289-4`) and resubmits.
2. Admin reviews extract vs YTJ, then **approve_business** (no bypass).
3. Founder explicitly confirms owner authority + willingness for **real** Stripe LIVE verification.
4. Admin records `approve_live_v2_pilot` for `eced0f8c-c2e4-469b-8bba-15170be68cc1`.
5. Separate mission still required to allowlist + open create gate (P9.33 procedure).

**Do not enable LIVE Connect creation until steps 1–4 are done and explicitly authorized.**
