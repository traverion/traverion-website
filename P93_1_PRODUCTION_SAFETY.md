# P9.3.1 — Production Custom onboarding safety deployment

**Date:** 2026-11-16  
**Project:** Traverionapp `xcopqllkulxfkpunetbc` (production, linked)  
**Commit:** `da9629845157aa8b2941641609ed9ee49dc171fc`  
**LIVE accounts created:** none  
**Gate left:** OFF  

## Verdict: PASS

Migration 311 was absent, not partial. It is now applied and recorded. The gated Edge function is the active production version. Existing Express data and payout flags are unchanged.

## 1. Migration 311

| Check | Before | After |
| --- | --- | --- |
| `schema_migrations` latest | 310 | **311** `p93_live_custom_onboarding_gate` |
| Allowlist table / claim function / claim column | absent | present |
| Gate row | absent | `live_custom_onboarding_enabled = 0` |

The stalled earlier attempt had not created any of these objects.

Privileges: `anon` and `authenticated` cannot select or insert the allowlist and cannot execute `claim_connect_account_create`. `service_role` can.

## 2. Edge function

| | |
| --- | --- |
| Function | `connect-supplier-onboarding` |
| Previous version | 24 (`cbdeaa87…`) |
| Deployed version | **25** ACTIVE |
| `verify_jwt` | false (unchanged; the function checks the bearer itself) |
| Bundle hash | `a5a32772541427c0fb69e08d3b8afdab2d17a8f5e412b3d726f7ceca9ff33b4d` |

Downloaded version 25 contains `liveCustomCreateAllowed`, the flag key, idempotency keys, and the second-LIVE-account refusal. It does not contain the Express fallback `api_native_express_fallback`.

## 3. Gate readback

- `live_custom_onboarding_enabled`: **0**
- `live_custom_onboarding_allowlist`: **0 rows**

## 4. Authorization and isolation

- `POST ensure_account` with the public anon key: **401 Unauthorized**, no `account_id`.
- `POST admin_ensure_live_connect` with the same key: **401 Unauthorized**, `created` null.
- `claim_connect_account_create` for Royal Nordic returned `action: reuse` and the existing account id. `connect_create_claimed_at` stayed null.

No supplier-authenticated create was sent. With the flag at 0, the deployed function returns before `accounts.create`.

## 5. Royal Nordic

| Field | Value |
| --- | --- |
| Supplier | `9e42bd3a-e72c-4472-bb7e-e8c3a59e2c18` |
| Account | `acct_1UcAxbCOlSVGqrHJ` |
| Type / livemode | express / true |
| Status | restricted |
| Rail | `manual_iban` |
| Legacy id | `acct_1UcBXT2FvgTkBmd2` |

Unchanged from the preflight read.

## 6. Payout flags

| Key | value_int |
| --- | --- |
| `payout_execution_enabled` | 0 |
| `stripe_connect_transfers_enabled` | 0 |
| `payout_auto_prepare_enabled` | 0 |
| `payout_pilot_prepare_enabled` | 0 |

## 7. Certification matrix

| Test | Result |
| --- | --- |
| LIVE Custom gate OFF | **PASS** |
| Allowlist empty | **PASS** |
| Unauthorized creation rejected before Stripe | **PASS** (401, no account id; deployed source gates create) |
| Existing Express account preserved | **PASS** |
| Duplicate prevention | **PASS** (claim reuses the existing id) |
| Payout execution flags OFF | **PASS** |
| READY periods | **PASS** (0 ready, 0 total) |
| LIVE transfers | **PASS** (0 transfer attempts, 0 bank payout attempts) |
| Connected-account inventory | **PASS** (one LIVE Express mapping; no Custom) |

## 8. References

- Code: `da962984` on `main`
- Database: production migration version `311`
- Edge: `connect-supplier-onboarding` version **25** on `xcopqllkulxfkpunetbc`
