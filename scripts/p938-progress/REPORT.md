# P9.38 — Real Payout Onboarding & UX Completion

| | |
|---|---|
| Status | **DONE (safe improvements)** |
| Date | 2026-11-18 |
| LIVE Connect create | **still OFF** (not flipped) |
| Transfers / payout execution | **still OFF** |

## What shipped

1. **Server-first draft SoT** — wizard waits for `status` hydrate (`serverHydrated`) before writing `save_wizard_draft`, preventing empty local drafts from overwriting richer server progress. Merge prefers richer / newer server markers (`wizard_draft_updated_at`).
2. **Cross-device restore** — Income settings hydrates server draft into the local resume cache on load; clear progress also empties the server draft.
3. **Four-lane truthful status** — Form progress · Traverion business · Stripe verification · Payout readiness (`buildPayoutReadinessLanes`), on review, completion, and Income settings.
4. **Supplier-friendly copy** — removed “device-only” SoT messaging; progress is “Saved to your account”.
5. **Stripe LIVE architecture wired (gated)** — Review / completion can launch `ensure_account` + `fetchConnectAccountLink` **only** when `canProvisionConnectAccount` (TEST, existing account, or LIVE create allowed). Gates unchanged.
6. **Review / completion layout** — status grid reuse, top-aligned completion card (no mid-viewport float), sticky footer unchanged, review content width constrained.
7. **Sensitive data** — still no IBAN / full DOB in device or server draft; identity docs / banking prefer Stripe-hosted when connection is allowed.

## Explicit authorization still required before

Do **not** enable without founder approval:

```sql
-- 1) Allowlist one verified + pilot-approved supplier only
insert into public.live_custom_onboarding_allowlist (supplier_id) values ('…');

-- 2) Controlled window
update public.commercial_runtime_config
set value_int = 1
where key = 'live_custom_onboarding_enabled';
```

Also keep `stripe_connect_transfers_enabled = 0` and `payout_execution_enabled = 0` until a separate payout-execution mission.

## Certification

| Check | Result |
|---|---|
| `vitest` payout-setup-wizard + P9.38 cert | **PASS** |
| `npm run build` | **PASS** |
| LIVE gates flipped | **NO** |
| Authenticated browser E2E (login → wizard → Stripe return) | **PARTIAL** — code + unit/cert; full auth session depends on supplier credentials / Vercel deploy settle |

## Remaining

1. Full authenticated multi-device browser cert after deploy (login, edit, logout, login, Stripe return) once a TEST or allowlisted LIVE supplier session is available.
2. LIVE create still blocked until explicit gate + allowlist authorization.
3. EM Global / other rejected businesses remain ineligible until Traverion business verification + pilot approval.
