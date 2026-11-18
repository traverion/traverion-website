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
| Production deploy | `5ee25e1c` → hotfix `38a26ff4` → polish `bea742e5` on `main` |
| Authenticated browser (P921 Test Supplier) | **PASS** — Income Settings four-lane status; wizard Review resume; Save & finish → “Setup saved / Saved to your account”; next step “Finish Traverion business verification first.” Stripe Connect not started (gates off). |
| Stripe return / LIVE Account Link | **NOT RUN** — correctly blocked until LIVE create authorized |

## Authorization request (required before LIVE Connect create)

Please confirm explicitly if Traverion should:

1. Insert one allowlisted supplier into `live_custom_onboarding_allowlist`
2. Set `live_custom_onboarding_enabled = 1` for a controlled window

Until then, eligible UX shows truthful “Waiting for connection access” and will launch Stripe Account Link only after those gates (plus business verified + pilot approval) are on.

## Remaining

1. Multi-device logout/login restore cert on a second browser profile after bank-status polish settles.
2. LIVE create still blocked until explicit gate + allowlist authorization.
3. Businesses not Traverion-approved remain ineligible for Stripe connection.
