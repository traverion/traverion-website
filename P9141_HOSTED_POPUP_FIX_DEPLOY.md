# P9.14.1 — Hosted popup fix deployment

**Verdict: PASS**

**Commit:** `3118d4ed`  
**Deployment ID:** `7838995026`  
**Environment:** Production  
**Deploy state:** `success` (2026-11-16T23:09:42Z)  
**Host:** `https://partner.traverion.com`  
**Wizard chunk:** `assets/PayoutSetupWizard-BT9ptgvB.js` (contains `Continue verification`, `will not open Stripe until`, `Express account on file`; old auto-mount pattern absent)

## Bundle verification

| Check | Result |
| --- | --- |
| Production wizard serves new CTA copy | PASS |
| Auto-mount `stripeAuthAcknowledged \|\| !isExpress` gone | PASS |
| Native Accounts v2 form strings (`First name`, `submit_representative`) present | PASS |

## Authenticated Royal Nordic browser test

**Account:** `contact@royalnordic.fi` / supplier `9e42bd3a-…`  
**Path:** Open Set up payouts → Business → Representative → Identity → Bank  
**Constraint:** Did **not** click Continue verification

| Pass | Steps | Auto Stripe popup | Loading embed / Connect wrapper | Continue verification shown |
| --- | --- | --- | --- | --- |
| 1 | Business → Rep → Identity → Bank | None (`window.open` empty) | None | Yes on steps 2–4 (`Stripe verification required`) |
| 2 (after refresh) | Resume bank → back to Business → walk 2–4 again | None | None | Yes on steps 2–4 |

Footer Continue advanced Express steps without mounting Stripe. No account creation, no verification submit, no Continue verification click.

## Accounts v2 native forms

No LIVE Accounts v2 supplier exists on production. Confirmed:

1. Production wizard chunk still ships native representative fields (`First name` / `submit_representative`) for non-Express.
2. Staging Accounts v2 supplier on local Vite (`/partner/verification`) shows native FIRST NAME / LAST NAME form with no Continue verification / no embed.

## Safety (unchanged)

| Control | Value |
| --- | --- |
| `live_custom_onboarding_enabled` | **0** |
| `live_custom_onboarding_allowlist` | **0** |
| Pilot approvals | **0** |
| `payout_execution_enabled` | **0** |
| `payout_auto_prepare_enabled` | **0** |
| `payout_pilot_prepare_enabled` | **0** |
| `stripe_connect_transfers_enabled` | **0** |
| Royal Nordic | Express LIVE `acct_1UcAxbCOlSVGqrHJ`, `verification_status=verified`, onboarding `restricted` (unchanged) |

Temporary cert password for Royal Nordic was rotated/scrubbed after the browser run.
