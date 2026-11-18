# P9.49 — Native-feeling supplier onboarding

| | |
|---|---|
| **Date** | 2026-11-18 |
| **Supplier** | EM Global Oy (`eced0f8c-…`) |
| **Connect account** | **`acct_1UdHT6C7oDQnLYSF` preserved** |
| **Audit** | Accounts v2 `dashboard: none` → embedded Account Session **supported** |
| **Money gates** | create / transfers / payouts remain **0** |
| **API verdict** | **PASS** |
| **Browser verdict** | **PASS** (desktop 1440 + mobile 390) |

## Compatibility

LIVE `account_session` for Custom recipient account returned `mode: embedded` with `pk_live_…` publishable key and the same account id. Hosted Account Link is fallback-only.

## UI integration

- `/partner/onboarding` Status mounts `ConnectEmbeddedPanel` when verification is due (no primary redirect).
- Custom + connected Identity / Bank account phases use embedded Account Onboarding; Traverion duplicate KYC forms are hidden.
- Prefill reuses company / contact / draft representative fields where Stripe still allows writes.
- Labels: Business verification, Identity, Bank account, Ready to receive.

## Browser certification (EM Global)

| Check | Result |
|---|---|
| Authenticated status / identity / bank / business | **PASS** |
| No connect.stripe.com redirect | **PASS** |
| Embedded verification surface | **PASS** |
| Desktop 1440 + mobile 390 | **PASS** |
| Refresh resume | **PASS** |

Screenshots: `scripts/p949-screenshots/`.
