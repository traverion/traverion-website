# Stripe auth popup fix — payout wizard

**Date:** 2026-11-17  
**Frontend:** partner Vite/Vercel deploy from `main` (this commit)  
**Edge:** unchanged (`connect-supplier-onboarding` v30)  
**Safety:** LIVE creation gate **0**, allowlist **0**, payout flags **OFF**, Royal Nordic Express `acct_1UcAxbCOlSVGqrHJ` preserved

## Root cause

`ConnectAccountOnboarding` / `ConnectAccountManagement` (via `ConnectEmbeddedPanel` → `loadConnectAndInitialize`) loads Stripe’s embedded shell at `connect.stripe.com/embedded/loading`. For Express, Stripe user authentication cannot be disabled (`disable_stripe_user_authentication` is Custom-only), so mounting the component opens the auth window.

In `PayoutSetupWizard`, Express steps `representative` / `identity` / `bank` set `useStripeEmbed`. A `useEffect` auto-set `showStripeEmbed` whenever `stripeAuthAcknowledged` was true (including values restored from `localStorage` draft). Entering Representative details therefore mounted Account Onboarding immediately and triggered the popup without a deliberate action.

Accounts v2 / Custom already used native forms for those steps (`!isExpress`). The identity remediation path already required **Continue verification**; the Express path did not.

## Fix

1. **Remove auto-mount** on step entry. Reset `showStripeEmbed` / hosted fallback when `draft.step` changes.
2. **Express:** show a Traverion notice and a user-initiated **Continue verification** button. Mount `ConnectEmbeddedPanel` only after that click.
3. **Ordinary navigation:** footer Continue no longer depends on Stripe ack and does not open Stripe.
4. **Accounts v2:** unchanged native business / representative / identity / bank forms; no Express embed on those steps.
5. Legacy `SupplierNativeVerificationJourney` Express bootstrap no longer auto-mounts the embed (not the primary `/partner/verification` entry).
6. DEV-only `?express_embed_probe=1` exercises Express gating in local Vite without changing Stripe account type.

## Browser certification

Local Vite `http://127.0.0.1:5197`, staging supplier `p97-v2-…` (Accounts v2 / Custom `acct_1UcWUMC3Batf5jGY`):

| Case | Result |
| --- | --- |
| Accounts v2 → Representative | Native first/last name form; no embed wrapper; `window.open` empty |
| Accounts v2 mobile 390×844 | Same native representative form |
| Express probe (`?express_embed_probe=1`) → Representative / Identity | **Continue verification** shown; no auto Loading / wrapper / popup on navigate |
| Footer Continue on Express probe | Advances without mounting Stripe |
| Deliberate **Continue verification** | Mounts embed (`Loading secure step…` → Connect wrapper + auth note); no blank orphan windows observed |

## Production safety readback

| Control | Value |
| --- | --- |
| `live_custom_onboarding_enabled` | 0 |
| allowlist rows | 0 |
| payout execution / prepare / transfers | 0 |
| Royal Nordic | Express LIVE `acct_1UcAxbCOlSVGqrHJ` |

No account creation, Express→v2 migration, or payout activation in this change.
