# P9.3 — LIVE Custom onboarding readiness

**Date:** 2026-11-16  
**LIVE accounts created:** none  
**Payout execution:** not enabled  
**Express migrations:** none  

## Recommendation

**NO-GO** for the first LIVE Custom supplier.

The native wizard and a default-off creation gate are in source. The LIVE platform was not shown to accept the same Custom controller that TEST certification used, and this session stopped before any LIVE `accounts.create`. Production Edge is still the previous function until `311_p93_live_custom_onboarding_gate.sql` is applied and `connect-supplier-onboarding` is deployed.

**GO** to keep Royal Nordic on its existing LIVE Express account and to keep payout flags off.

---

## 1. LIVE compatibility assessment

Read-only retrieve of the local TEST platform (`sk_test_`, no account created):

| Field | TEST platform `acct_1TFXpMC3BaJIHpM6` |
| --- | --- |
| Country | FI |
| Charges / payouts | enabled |
| `capabilities.transfers` | active |
| Account type | standard (the platform itself) |

Read-only retrieve of the already-certified TEST Custom account `acct_1UcUhiC7ET5faiyl`:

| Field | TEST Custom |
| --- | --- |
| `type` | custom |
| `livemode` | false |
| `controller.requirement_collection` | application |
| `controller.stripe_dashboard.type` | none |
| `controller.fees.payer` | application_custom |
| `controller.losses.payments` | application |
| `capabilities.transfers` | inactive (past due) |
| `details_submitted` | true |
| `payouts_enabled` | false |

That is the configuration Traverion’s wizard is built for: platform-collected requirements, no Stripe Dashboard, platform losses, transfers capability only.

LIVE could not be re-read in this session. The Stripe CLI live key is expired, and the local environment has no `sk_live_`. Creating a LIVE account to test the controller was refused. Prior LIVE evidence (P8.4 / P8.5, not re-fetched) is a different shape:

| Field | LIVE Express `acct_1UcAxbCOlSVGqrHJ` on platform `acct_1TFXp1CJawbWge6X` |
| --- | --- |
| Type | express |
| Requirement collection | stripe |
| Dashboard | express |
| Transfers | inactive while requirements are past due |

So LIVE Connect works for Express. It does **not** prove that LIVE Custom accounts are created with `requirement_collection=application` and `dashboard=none`. Stripe’s current Accounts v2 guidance also prefers explicit dashboard, fees, and losses dimensions instead of `type: custom`. Traverion’s certified path remains Accounts v1 Custom. Moving to v2 is a separate approval and was not done here.

### Platform responsibilities if a later LIVE Custom create is approved

- Traverion collects business, representative, Connected Account Agreement (date + IP), and bank tokens.
- Traverion owns negative-balance losses on this controller (`losses.payments=application` on the TEST account).
- Traverion must remediate later requirements: identity documents, business corrections, bank replacement, and restrictions.
- Stripe still decides `charges_enabled`, `payouts_enabled`, `requirements`, and `disabled_reason`. The wizard sets `verified` only when `connectCanReceiveTransfers` is true.
- Identity documents are not stored in Traverion. When a document requirement is outstanding, the identity step opens an embedded verification component inside the page.
- Ongoing maintenance is webhook `account.updated` plus Refresh status. There is no separate Custom health job.

### TEST vs LIVE differences that block a first supplier

1. LIVE Custom controller match is unproven.
2. The production Edge function running today can still create a connected account. The new gate is source-only until migration `311` and a function deploy.
3. Bank tokenization in the browser now accepts `pk_test_` or `pk_live_`. A test token still cannot be attached to a live account. Production must present a live publishable key before a LIVE bank step can succeed.
4. Staging does not mirror `connect_account_livemode`. On that host, a complete TEST profile can show “Complete” in the review list. Production must keep the livemode column populated so a TEST account cannot read as Verified.

---

## 2. Production feature gate

Migration `supabase/migrations/311_p93_live_custom_onboarding_gate.sql`:

- `commercial_runtime_config.live_custom_onboarding_enabled` inserts at **0**. It does not change the four payout flags.
- `live_custom_onboarding_allowlist` is empty and granted only to `service_role`.
- `claim_connect_account_create` locks the supplier row, reuses an existing account id, or returns `in_progress` for two minutes.

Edge `connect-supplier-onboarding`:

- LIVE create requires flag `1` and an allowlist row. Missing flag, missing table, or a failed claim refuses the create.
- TEST create is unchanged aside from the claim lock and a Stripe idempotency key `traverion-custom:{supplierId}:{mode}`.
- Express fallback on Custom failure is removed. A failed Custom create does not mint Express.
- A linked Express account is returned as-is. LIVE Express is not archived. `start_native_custom` still rejects `livemode`.
- A second LIVE account is refused when `connect_legacy_account_id` cannot be restored.
- Supplier id comes from team membership. More than one organization without a single owner match returns 409.
- On LIVE, an untagged account is accepted only when it is the Express account already stored on that supplier. Custom accounts must carry `traverion_supplier_id`.
- `verified` in the status payload is `connectCanReceiveTransfers(...) === true`.

The production apply of migration 311 did not finish (the linked query stalled and was stopped). The function was not deployed. Until both land, the gate is not active in production.

---

## 3. Verification lifecycle

| Event | Behavior |
| --- | --- |
| Identity document / additional document | Review and identity step show “Action required”. “Continue verification” opens embedded onboarding inside Traverion. File bytes are not written to Traverion tables. |
| Business correction | Business step re-submits to the connected account, including when Traverion’s own company profile is locked. |
| Representative correction | Same step updates the existing representative person. Age 18+, country, email, and ownership 0–100 are checked. `owners_provided` is set only when ownership is actually declared. |
| Verification failure / restriction | Review banner plus human-readable outstanding requirements. “Update this information” returns to the earliest matching step. |
| Bank update | “Bank on file” skips entry. A due `external_account` requires a new tokenized IBAN. Empty IBAN does not replace a stored bank. |
| Resume | Outstanding Stripe keys map to business, representative, identity, or bank. Session draft still restores in-progress fields after refresh. |
| Verified | Not set from “form saved”. Pending and rejected stay off the Verified label. |

The embedded document step appears only when those requirement keys are present. The staging supplier used for screenshots had no document due, so that panel was not on screen. Unit coverage is in `src/lib/connect-native-p93.cert.test.ts`.

---

## 4. Browser certification

Host: `http://127.0.0.1:5175` with the staging project and the existing TEST Custom supplier. Account id before and after the walk: `acct_1UcUkO2HdgQeyOEp`. No second account was created. No LIVE call was made.

Desktop screenshots: steps 1–6. Mobile screenshot: step 6 at 390px. Files: `.tmp/p93-live-readiness/screenshots/`.

Observed: one step at a time, Back / Continue, “Progress saved”, Connected Account Agreement names Stripe only in the legal sentence, bank copy says the full number is tokenized, review states execution is off. This was not `partner.traverion.com`, because that site still serves the previous bundle and its Edge can create a LIVE account.

---

## 5. Security and compliance matrix

| Control | Result |
| --- | --- |
| LIVE Custom create default off | **In source.** Not confirmed on production Edge |
| Allowlist empty | **In migration.** Not confirmed applied |
| Idempotent create | Claim lock + Stripe idempotency key |
| Express accounts not replaced | LIVE Express returns early; live switch refused |
| Supplier isolation | Membership resolution + metadata match |
| Verified only from Stripe capabilities | `verified` follows `connectCanReceiveTransfers` |
| Agreement | TOS checkbox, date, and IP on the connected account |
| Raw documents / full IBAN in Traverion | Not stored. Bank step tokenizes. Document step uses the embedded component |
| Payout flags | Not changed. Transfers still require test mode and `stripe_connect_transfers_enabled=1` |
| Royal Nordic | Not read or written this session. Code path still reuses a linked LIVE Express account |
| Sensitive logs | Edge does not log bank tokens or document bytes. Admin create errors are truncated |

---

## 6. What a later approval still needs

1. Apply migration 311 on production and confirm `live_custom_onboarding_enabled=0` and an empty allowlist.
2. Deploy `connect-supplier-onboarding` with this gate.
3. Read-only LIVE platform check, or one approved create, proving `requirement_collection=application` and `dashboard=none`.
4. Put that supplier id on the allowlist and set the flag to 1 only for that create. Leave payout flags at 0.
5. Use a live publishable key for that supplier’s bank step.
6. Do not move Royal Nordic off Express in that same change.
