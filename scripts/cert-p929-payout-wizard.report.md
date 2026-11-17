# P9.29 — Premium Payout Onboarding UX Rebuild

**Verdict: PASS**

| Ship | Value |
|------|--------|
| Commit | *(pending push)* |
| Cert base | `http://127.0.0.1:5182` (local Vite with production Supabase) |
| Supplier | `p921-payout-mwkvnn8d@traverion.invalid` (isolated; no Connect account) |
| LIVE Connect create | **OFF** (unchanged) |
| Payout / transfer execution | **OFF** (unchanged) |
| Screenshots | `scripts/p929-screenshots/` |
| Machine report | `scripts/cert-p929-payout-wizard.report.json` |

---

## What shipped

1. **Layout** — Dedicated `.payout-wizard` shell: fixed rail (desktop), single scroll region, sticky footer outside content, centered `36rem` canvas, mobile chrome without nested scroll traps.
2. **Visual system** — Calm white / soft-gray surfaces, Traverion blue accents, shared stage transition, tighter inputs/footer controls.
3. **Six steps** — Business → Representative → Identity → Bank → Preferences → Review with clearer ledes, auto-save, Back/Continue, scroll+focus reset on navigation.
4. **Completion** — Done opens a completion screen (saved vs verification vs payout connection), working **Return to Income & Payouts**, **Edit submitted details**. Never labels Verified / payouts enabled without provider confirmation.
5. **Settings sync** — Income settings show `Setup saved` / `Details saved`, onboarding progress, and local bank “Saved locally — not connected” when draft-first.

---

## Browser certification (26 checks)

| Check | Result |
|-------|--------|
| Login disposable supplier | PASS |
| Wizard opens | PASS |
| All 6 steps + Done → completion (1440) | PASS |
| No fake Verified | PASS |
| Return → `#income-payout-settings` | PASS |
| Settings shows saved onboarding state | PASS |
| No horizontal overflow (settings 1440) | PASS |
| Full walk + no wizard overflow (1280) | PASS |
| Full walk + completion (mobile 390) | PASS |
| Business + settings (768, 375) | PASS |
| Overflow sweeps | PASS |

Evidence screenshots include every step on desktop 1440 / 1280 and mobile 390, plus completion and post-return Settings.

---

## Financial integrity

- LIVE Custom account creation remains gated / unavailable.
- Wizard stays draft-first when connection cannot be provisioned.
- Completion and Settings distinguish **saved** from **verified** / **connected**.
- No money movement enabled.

---

## Residual notes

- LIVE Stripe bank attach / identity upload against production still blocked by design (same as P9.21).
- Playwright added as a devDependency for this certification harness (`scripts/cert-p929-payout-wizard.mjs`).
