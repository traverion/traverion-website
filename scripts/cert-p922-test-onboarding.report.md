# P9.22 — Complete Stripe TEST Onboarding Certification

**Verdict: PASS**

| Ship | Value |
|------|--------|
| Implementation / cert commits | see git (this report + director-step mapping) |
| TEST edge | Local Deno `http://127.0.0.1:8000` with **sk_test_** only (`.tmp/p922-test-edge.env`, not deployed) |
| Production edge | Remains **LIVE** (`environment=live`); LIVE create still refused |
| Safety flags | `live_custom_onboarding_enabled=0`, payout/transfer execution `0` |

Do not treat this as LIVE certification. Stripe TEST credentials were never written to the production LIVE edge.

---

## 1. TEST environment isolation

| Check | Evidence |
|-------|----------|
| Production edge mode | `environment: live` on `…/functions/v1/connect-supplier-onboarding` |
| Isolated TEST edge mode | Deno serve of same function source with `STRIPE_SECRET_KEY=sk_test_…` → `environment: test` |
| No TEST keys on LIVE endpoint | LIVE `ensure_account` → `"LIVE payout account creation is turned off."` |
| Disposable supplier | `p922-test-mwkw7hky@traverion.invalid` / `635efbf3-41c4-4a42-9039-4586f046c090` labeled P922 TEST |
| Cleanup | Connect fields cleared on profile; Stripe TEST account `acct_1Ucp1kC3Bam0xr4h` deleted |

---

## 2. Stripe TEST account lifecycle

| Step | Result |
|------|--------|
| Business from supplier profile → Stripe | **PASS** (`submit_business` / ensure) |
| Ensure idempotent (no duplicate accounts) | **PASS** — two ensures → same `acct_1Ucp1kC3Bam0xr4h` |
| Representative | **PASS** `person_1Ucp22C3Bam0xr4h1Xb9dhLn` (rep+owner 40%, not director) |
| Multiple beneficial owners | **PASS** Grace 35% + Alan 25%; not auto-directors |
| Identity document upload | **PASS** `file_1Ucp2WC3BaJIHpM6HTYDHlCV` via `upload_identity_document` (ephemeral; not Traverion storage) |
| Bank tokenize + attach | **PASS** `bank_attached: true` |
| Bank replace same account | **PASS** same `account_id` |
| Preferences saved | **PASS** biweekly / 75 |
| Agreement accepted | **PASS** `stripe-recipient-notice-2026-11-16` |
| Requirements / capabilities read back | **PASS** — status `restricted`; `transfers: inactive`; `can_receive_transfers: false` |
| Must not show LIVE Verified | **PASS** — `connect_account_livemode: false`; `verified` not claimed |

Machine evidence: `scripts/cert-p922-test-onboarding.report.json`.

---

## 3. Failure / recovery

| Case | Result |
|------|--------|
| Invalid bank (non-test IBAN) | Token create rejected by Stripe TEST (expected) |
| Duplicate owners submit | Succeeded (upsert by name); no new Connect account |
| Network abort + retry | AbortError then status retry → same account |
| LIVE ensure while gate OFF | Refused |
| Incomplete identity / remaining requirements | After happy path, Stripe still due: `company.directors_provided` + `directors.*` (directors stay in business SoT; not auto-classified as owners) |

---

## 4. Existing-account / Royal Nordic

| Check | Result |
|-------|--------|
| Existing TEST Custom path | Re-`ensure_account` → same account id |
| Royal Nordic Express `acct_1UcAxbCOlSVGqrHJ` | Not linked on RN profile currently; **not modified** — TEST keys cannot call LIVE Stripe objects; no RN profile writes |
| RN profile snapshot | `eced0f8c-…` / EM Global Oy — Connect fields null / `not_started` |

---

## 5. UX fix from E2E

Director Stripe requirement keys resume the **business** step (directors SoT), not representative/owners.

---

## 6. Remaining notes (not FAIL)

- After bank + TOS, Stripe still asks for **director persons** attestation. That is expected while directors are maintained in business onboarding and are not submitted as owners.
- Full browser UI against local Deno was not required for this PASS — lifecycle certified through the same edge actions the wizard invokes, on an isolated TEST serve path.
- Production partner UI remains LIVE draft-first until a separate LIVE mission.

---

## 7. Safety attestation

- LIVE Custom creation OFF  
- Allowlist unchanged / empty for this mission  
- LIVE payouts & transfers OFF  
- No LIVE bank/identity changes  
- No Express migration  
- No money movement  
- TEST data labeled and cleaned from Connect linkage  

**Final verdict: PASS**
