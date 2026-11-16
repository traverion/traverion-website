# P9.7 — Accounts v2 deployment and browser certification

**Date:** 2026-11-16  
**Production function:** `connect-supplier-onboarding` version **26** on Traverionapp `xcopqllkulxfkpunetbc`  
**TEST function:** same build, version **3**, on staging `gedktutbpfwnstcbffsc`  
**TEST account:** `acct_1UcWUMC3Batf5jGY` (reused; no second account created)  
**Money movement:** none

## Verdict

**GO** to leave this deployment in production with the creation gate off.  
**NO-GO** for enabling the gate, a LIVE Accounts v2 pilot, or payout activation.

The six-step wizard was exercised in a browser against staging and Stripe TEST. Identity document and liveness capture were not completed. Stripe TEST did not request a document after the keyed data, so that part is not certified as passed.

## What was deployed

Version 26 replaces production version 25. LIVE creation still throws before `stripe.accounts.create` unless `live_custom_onboarding_enabled` is exactly 1 and the supplier is on the allowlist. Both are unchanged: flag `0`, allowlist empty. The Accounts v2 create runs only when the platform secret resolves to TEST. Production’s secret digest does not match the local TEST key.

Existing Express accounts return on the current link. Royal Nordic stayed `acct_1UcAxbCOlSVGqrHJ`, type `express`, livemode true. There is no Express-to-v2 migration and no Express fallback if v2 creation fails.

The function bundle includes `supabase/functions/_shared/accounts-v2-config.ts`. The edge import no longer reaches outside the functions directory.

## TEST browser environment

| Item | Value |
| --- | --- |
| App | Vite `http://127.0.0.1:5197` with mode `partner-demo` |
| Supabase | staging `gedktutbpfwnstcbffsc` only |
| Publishable key | `pk_test_` |
| Stripe secret used by the function | same TEST key as the local cert, not the production secret |
| Supplier | staging user `9d160fa0-…` |
| Connected account | existing `acct_1UcWUMC3Batf5jGY` |

The page load did not call `xcopqllkulxfkpunetbc`. An unauthenticated `ensure_account` against production returned 401 and no account id. A second `ensure_account` on staging returned the same TEST account.

## Browser certification

Desktop and a 390×844 mobile viewport. Real clicks, typing, refresh, and Back.

| Step | Result |
| --- | --- |
| Business | Prefill of the Finnish company, empty legal name blocked with “Enter the legal business name.”, city edited to Espoo and saved |
| Representative | Empty last name blocked. Aino Testi, date of birth, title, email, and phone saved |
| Identity | Traverion copy and the Connected Account Agreement checkbox. No Stripe login popup and no external redirect on the ordinary path |
| Bank | “Bank on file” shown. Submitting a replacement IBAN tokenized it and advanced. The full IBAN is not in the supplier row |
| Preferences | Monthly, minimum 25 EUR, saved on the staging profile |
| Review | Business, representative, and preferences Saved; bank On file; identity “Submitted — pending review”. The screen does not say Verified |

Refresh on the same tab restored the representative step, including the date of birth, after the verification route stopped forcing step 1. That route change is in this commit and was verified on the local app. It is not yet on the hosted production website.

Mobile showed Save & exit, the step body, Back, and Continue without a horizontal break. Back returned to the representative form.

## Verification lifecycle

| Situation | How it was tested | Result |
| --- | --- | --- |
| Missing business details | Cleared the legal name and pressed Continue | PASS, real UI |
| Missing representative | Cleared the last name and pressed Continue | PASS, real UI |
| Bank correction | Replaced the account through Stripe.js and the TEST function | PASS, real |
| Pending review | Review copy after a successful TEST submission | PASS. TEST is never labeled Verified |
| Restricted account | Staging mirror set to `restricted` with a disabled reason, then the page reloaded | SIMULATED. Banner: “This payout account needs attention” |
| Additional identity request | Same simulated row included `verification.document` | SIMULATED. Identity showed “Continue verification” inside Traverion. The document step was not opened or completed |
| Requirement recovery | “Update this information” | SIMULATED. Opened Business, the earliest mapped step |
| Real Stripe requirements after refresh | `refresh` overwrote the simulation | `currently_due` 0, `past_due` 0, transfers `active`, status `complete` |

Do not treat the simulated document panel as a passed liveness or document check.

## Retrieved account after the wizard

| Field | Value |
| --- | --- |
| Dashboard | `none` |
| Requirements, losses, fees | `application` |
| Recipient | present |
| Merchant | absent |
| `card_payments` | absent |
| `stripe_transfers` | `active` |
| Country / livemode | FI / false |
| Stored type | `custom` (v1 retrieve reports type `none`) |
| Verified in the partner UI | false |

## Production safety after deployment

| Check | Result |
| --- | --- |
| LIVE creation gate | 0 |
| Allowlist | 0 |
| Unauthenticated create | 401, no account |
| Royal Nordic | Express `acct_1UcAxbCOlSVGqrHJ`, livemode true |
| LIVE account mappings | 1, unchanged |
| Payout flags | all 0 |
| Earning items / amount | 11 items, 85232 minor units, unchanged |
| READY periods and transfers | 0 and 0 |

## Remaining limits

1. Document and liveness verification were not completed.
2. The account is a Finnish company. An individual entity type was not walked through the browser.
3. The partner UI will not show Verified for a TEST account, even when `stripe_transfers` is active.
4. The resume-step fix is local until the website is deployed. The production function is already version 26.
5. LIVE Accounts v2 creation with dashboard `none` was not attempted.

## Recommendation

Keep the gate off and the allowlist empty. The next milestone can be a separately approved LIVE pilot. This certification does not authorize that pilot, a migration of Royal Nordic, or any payout.
