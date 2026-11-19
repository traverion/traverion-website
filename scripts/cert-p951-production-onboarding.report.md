# P9.51 — Full production onboarding certification

| | |
|---|---|
| **Date** | 2026-11-19 |
| **Supplier** | EM Global Oy (existing LIVE Connect, not a new account) |
| **Connect** | `acct_1UdHT6C7oDQnLYSF` still the only row, status `restricted` |
| **Money gates** | unchanged at 0 (`live_custom_onboarding_enabled`, `payout_execution_enabled`, `stripe_connect_transfers_enabled`) |
| **KYC submitted** | no |
| **Accounts created** | no (`ensure_account` / `submit_*` not called) |
| **Verdict** | **PASS** (0 failed of 130) |

Production: `https://partner.traverion.com/partner/onboarding` after `05132019`.

## What was certified

Desktop 1440, tablet 768, and mobile 390. Each phase was opened, refreshed, and checked for a stable URL, no blank flash, no navigation loop, no page-level horizontal overflow, and a readable type scale.

| Phase | Result |
|---|---|
| Company | Verified summary shows the saved legal name, brand, address, and registration document. Refresh keeps the same legal name. |
| Documents | Same approved record, document on file. |
| Representative | Existing Custom account uses Stripe embedded onboarding, prefilled. Traverion date-of-birth and ownership controls stay unmounted so the supplier is not asked twice. |
| Payouts | Same embedded Stripe step, still prefilled. No second Connect account. |
| Status | “Verification pending”. Identity and bank are **Action required**. Ready to receive is **Needs attention**. Progress is **2 of 4**, not a false 4 of 4. |

Autosave of the wizard draft and setup progress was restored to the pre-test JSON after the run. Profile identity columns did not change.

## Fixes deployed

- Blank resume drafts no longer hide company fields already stored on the profile.
- Onboarding does not paint until that profile has loaded, so a refresh cannot flash “0 of 4” or empty facts.
- Local wizard completion no longer marks identity or bank done while Stripe requirements are still open.
- The embedded Stripe form is no longer covered by a permanent loading panel, and an existing connected account no longer shows the “payout connection opens next” notice.
- The step title is no longer programmatically focused, which had drawn a box around “Identity”.

## Remaining

- Stripe’s own component can show its spinner for a few seconds before the form paints. That is the embedded component, not an empty Traverion page.
- The Traverion date-of-birth picker and ownership stepper are for Custom accounts that do not yet have Connect. This LIVE account collects those fields inside Stripe. They were not filled with synthetic data.
- The business ID shown inside the Stripe form should be checked against the registration number on the Traverion verified summary. They did not read as the same value. Nothing was edited.
- On a 390px width the phase chips scroll sideways; “Ready to receive” starts off-screen until the row is swiped.

## Production readiness

The onboarding shell is fit for this supplier to continue. Payouts are not enabled: Connect is restricted, identity and bank are still required, and the money gates are still off.
