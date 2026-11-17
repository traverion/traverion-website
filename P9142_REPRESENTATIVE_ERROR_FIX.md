# P9.14.2 — Representative details error fix

**Verdict: PASS**

**Commit:** `d6fa3978`  
**Deployment ID:** `7839359180`  
**Environment:** Production (`partner.traverion.com`)  
**Wizard chunk:** `PayoutSetupWizard-CQUXBsDL.js` · panel `ConnectEmbeddedPanel-DANdWh0x.js`

## 1. Root cause and failing request

| Item | Detail |
| --- | --- |
| Failing request | `POST …/functions/v1/connect-supplier-onboarding` with `action: "account_session"` |
| HTTP | **401** body `{"success":false,"error":"Unauthorized"}` |
| Trigger | User-initiated **Continue verification** mounts `ConnectEmbeddedPanel`, which calls Account Session |
| Why 401 | Browser JWT had a revoked `session_id` (e.g. after password rotation). `auth.getUser()` fails → edge returns Unauthorized |
| Why two red alerts | (1) Panel `setError` + `onError` → wizard `setError` duplicated the same generic copy; (2) supabase-js hid the JSON body behind a technical invoke error, mapped to “Check your connection” |
| Why empty step | Failed mount left `showStripeEmbed` true with only error boxes — no Continue verification CTA and no requirements list |

Valid RN sessions create Account Sessions successfully (`mode: embedded`, `acct_1UcAxbCOlSVGqrHJ`). The UI failure was auth + error handling, not Stripe account integrity.

## 2. Fix

- Parse edge function JSON errors; map Unauthorized / session loss to a sign-in message.
- Cache the first Account Session secret (avoid double fetch).
- On launch failure: single wizard alert, unmount embed, restore **Continue verification**, disable footer Continue while failed.
- Express step shows outstanding requirement labels; no auto-mount / no auto popup.
- Accounts v2 native representative form unchanged.

## 3. Hosted browser certification (Royal Nordic)

Fresh signed-in session on production:

| Check | Result |
| --- | --- |
| Representative loads without red errors | PASS — CTA + requirement list |
| No automatic Stripe popup | PASS (`window.open` empty until deliberate start) |
| Continue verification when needed | PASS |
| Deliberate Continue verification | PASS — embed + auth note, no duplicate alerts |
| Refresh / re-open | PASS — no auto embed |
| Desktop + mobile | PASS |

No verification submitted; no identity/bank forms completed in Stripe.

## 4. Accounts v2 regression (TEST / unit)

`accounts-v2-config`, `supplierOnboarding`, `live-accounts-v2-pilot-eligibility`, `connect-native-p91`, `connect-onboarding-errors`: **passed**.

## 5. Production safety

| Control | Value |
| --- | --- |
| `live_custom_onboarding_enabled` | **0** |
| Allowlist | **0** |
| Payout flags | **0** |
| LIVE v2 accounts | **0** |
| Royal Nordic | Express LIVE `acct_1UcAxbCOlSVGqrHJ`, verified, restricted (unchanged) |

Temporary cert password scrubbed after the run.
