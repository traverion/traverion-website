# P9.49 — Native-feeling supplier onboarding

| | |
|---|---|
| **Date** | 2026-11-18 |
| **Supplier** | EM Global Oy (`eced0f8c-c2e4-469b-8bba-15170be68cc1`) |
| **Connect account** | **`acct_1UdHT6C7oDQnLYSF` preserved** |
| **Audit** | Accounts v2 `dashboard: none` → embedded Account Session **supported** |
| **Money gates** | create / transfers / payouts remain **0** |
| **API verdict** | **PASS** |

## Compatibility

LIVE `account_session` for Custom recipient account returned `mode: embedded` with client secret and the same account id. Hosted Account Link is fallback-only.

## UI integration

- `/partner/onboarding` Status mounts `ConnectEmbeddedPanel` when verification is due (no primary redirect).
- Custom + connected Identity / Bank account phases use embedded Account Onboarding; Traverion duplicate KYC forms are hidden.
- Prefill reuses company / contact / draft representative fields where Stripe still allows writes.
- Labels: Business verification, Identity, Bank account, Ready to receive.

## Remaining browser cert

Authenticate as EM Global on production after deploy; confirm desktop + mobile show Stripe components inside Traverion chrome without unnecessary external redirects.
