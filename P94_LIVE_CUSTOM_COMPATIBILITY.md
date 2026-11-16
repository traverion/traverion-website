# P9.4 — LIVE Custom compatibility certification

**Date:** 2026-11-16
**Project:** Traverionapp `xcopqllkulxfkpunetbc` (production)
**LIVE accounts created:** none
**Payouts, transfers, READY periods:** none
**Gate left:** `live_custom_onboarding_enabled = 0`, allowlist empty

## Recommendation

**NO-GO** for a first LIVE Custom supplier.

The LIVE platform is the Finland Connect platform already used for Royal Nordic’s Express account. That read does not show the Custom controller certified in TEST. Stripe provides no read-only flag that Custom creation is enabled, and this mission did not create an account to find out.

**GO** to leave the creation gate off, leave the allowlist empty, keep Royal Nordic on its canonical Express account, and keep every payout flag off.

---

## 1. LIVE platform findings

The production Edge secret was read in place. The secret resolver returns `mode=live` only for an `sk_live_` key with `STRIPE_LIVE_PAYMENTS_ENABLED` on. No key material is recorded here. The Stripe CLI key was not used; it belongs to a different account and is expired.

A temporary read-only inspector retrieved the platform, listed connected accounts, and retrieved Royal Nordic. It called no create, person, token, or transfer API. It was deleted immediately. The endpoint now returns 404.

`Account.livemode` was absent on every retrieved account. The onboarding function already treats an omitted `livemode` on this LIVE platform as live unless Stripe sends `false`. Mode is taken from the live secret, not from that omitted field.

| Field | LIVE platform |
| --- | --- |
| Account | `acct_1TFXp1CJawbWge6X` |
| Country | FI |
| Type | standard |
| Charges / payouts / details submitted | enabled |
| `capabilities.transfers` | active |
| Platform requirements currently due / past due | 0 / 0 |
| Connected accounts returned | 2, `has_more=false` |

Both connected accounts are Finland Express accounts:

| Account | Role | Controller |
| --- | --- | --- |
| `acct_1UcAxbCOlSVGqrHJ` | Royal Nordic canonical mapping | `requirement_collection=stripe`, dashboard `express`, fees `application_express`, losses `application` |
| `acct_1UcBXT2FvgTkBmd2` | Previously recorded legacy Express account | same Express shape |

Royal Nordic: `transfers=inactive`, charges and payouts disabled, `disabled_reason=requirements.past_due`, 12 currently due and 12 past due. Due keys are `business_type`, `external_account`, representative address, date of birth, and name, plus `tos_acceptance.date` and `tos_acceptance.ip`. No Custom account is on the platform.

Documented Custom behavior (Stripe Custom accounts and Custom onboarding guides): the platform collects every verification fact, manages bank accounts and the payout schedule through the API, and the account holder has no Stripe login. Requirements depend on country, service agreement, and requested capabilities. Stripe may still require a government ID after keyed data is submitted. Express is the other product: Stripe collects onboarding and identity, which matches both LIVE accounts. Stripe marks the Custom guide as the legacy account-type path and points new platforms at Accounts v2. Traverion’s certified path remains Accounts v1 Custom. v2 was not certified.

---

## 2. TEST versus LIVE

TEST figures are the already-certified Custom account `acct_1UcUhiC7ET5faiyl` on TEST platform `acct_1TFXpMC3BaJIHpM6`. They are a different Stripe account from LIVE. TEST success is not LIVE evidence.

| Topic | TEST Custom (certified) | LIVE (this read) |
| --- | --- | --- |
| Account creation | `type=custom` was created | No Custom account exists. Create was not called. |
| Business and representative data | Platform collects (`requirement_collection=application`) | Stripe collects (`requirement_collection=stripe`). Royal Nordic is still due business type and representative identity fields. |
| Identity verification | Platform-collected; Stripe may still demand a document | Express: Stripe owns identity verification. No document key is in the current due list. |
| Bank account | Platform attaches a bank token on the Custom account | `external_account` is due on the Express account and is collected by Stripe. |
| Terms of Service | Platform records date and IP on the Custom account | `tos_acceptance.date` and `tos_acceptance.ip` are due, and Stripe collects them for Express. |
| Ongoing requirements | Platform must keep collecting as Stripe adds requirements | Express: Stripe collects when requirements change. |
| Transfers and payouts | Custom `transfers` inactive, payouts disabled, 15 requirements due | Platform `transfers` is active. The Express account’s `transfers` is inactive. No connected account is transfer-eligible. |
| Fees / losses / dashboard | `application_custom` / `application` / dashboard `none` | `application_express` / `application` / dashboard `express` |

The shared facts are country FI, platform-level transfers active, and platform responsibility for payment losses. The Custom-native facts — platform collection, no Dashboard, `application_custom` fees — appear only on the TEST account.

---

## 3. Production gate

`connect-supplier-onboarding` is still version **25**, bundle `a5a32772541427c0fb69e08d3b8afdab2d17a8f5e412b3d726f7ceca9ff33b4d`, the same build inspected in P9.3.1.

Database readback:

- `live_custom_onboarding_enabled`: **0**
- `live_custom_onboarding_allowlist`: **0 rows**

`liveCustomCreateAllowed` denies LIVE creation unless the flag is exactly 1 and that supplier has an allowlist row. A flag read error is treated as 0. Both the supplier create and the admin create call that check and return before `accounts.create`. On the supplier path the check also runs before the create claim. A supplier with no linked account and no legacy account id reaches that denial before any Stripe request.

This certification did not call `ensure_account` or `admin_ensure_live_connect`. The deployed source order plus the flag and empty allowlist already guarantee the pre-Stripe rejection. Calling the create path was unnecessary.

A supplier who already has the canonical Express account is returned that account from the existing-account branch. That branch does not create a Custom account.

---

## 4. Existing supplier protection

| Check | Result |
| --- | --- |
| Canonical mapping | One row: Express, livemode true, status `restricted`, rail `manual_iban`, account `acct_1UcAxbCOlSVGqrHJ` |
| Duplicate mapped account ids | 0 |
| Other Stripe connected account | Legacy Express `acct_1UcBXT2FvgTkBmd2` only. It was already recorded. It is not the current mapping. |
| Custom accounts | 0 |
| Royal Nordic earnings | eligible 5, amount 42993, frozen commission 7587; pending 2, amount 42239, frozen commission 7453; reversed 3, amount 0 |
| Payout flags | `payout_execution_enabled`, `stripe_connect_transfers_enabled`, `payout_auto_prepare_enabled`, `payout_pilot_prepare_enabled` all **0** |
| Payout periods / READY | 0 / 0 |
| Transfer attempts / bank payout attempts | 0 / 0 |

Eligible and pending amounts and frozen commissions match the last Royal Nordic snapshot. This session only read those rows.

---

## 5. PASS / FAIL

| Check | Result |
| --- | --- |
| LIVE platform compatibility | **PASS** — Finland LIVE platform, charges and payouts enabled, platform transfers active, Express Connect readable |
| Custom account configuration | **FAIL** — the certified Custom controller was not returned by LIVE |
| Native onboarding requirements | **FAIL** — LIVE accounts are Stripe-collected Express accounts |
| Compliance responsibilities | **FAIL** for Custom — LIVE shows Express duties (Stripe collects requirements and TOS; platform bears payment losses). Custom collection by Traverion is not active on LIVE |
| Production gate enforcement | **PASS** — flag 0, allowlist empty, deployed v25 denies before `accounts.create` |
| Existing supplier isolation | **PASS** — canonical Express retained, no new connected account |
| Money-movement safety | **PASS** — flags off, no READY periods, no transfers, earnings unchanged |

---

## 6. Remaining blockers

1. LIVE has never returned `type=custom` with `requirement_collection=application`, dashboard `none`, and fees `application_custom`.
2. Stripe does not publish a read-only “Custom creation allowed” flag for this platform. A matching retrieve after one approved create is the remaining proof.
3. Stripe’s Custom guide is the legacy account-type path. Accounts v2 was not part of this certification.
4. Royal Nordic’s Express account remains restricted, with transfers inactive, until its own Stripe requirements are completed. That work is separate from Custom onboarding.
5. The gate stays off until a later, explicit approval sets the flag and adds one allowlist row.

## Stop

No LIVE account was created. No account was migrated. No transfer, READY period, or payout was activated. `live_custom_onboarding_enabled` remains 0 and the allowlist remains empty.
