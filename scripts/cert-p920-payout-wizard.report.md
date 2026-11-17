# P9.20 — Payout wizard: investigation + safe fixes

**Verdict: PARTIAL PASS**

| Ship | Value |
|------|--------|
| Commit | `99c89853` |
| Vercel | **7857713937** |

LIVE account creation remains OFF by design. Application-level fixes for premature create, ownership validation, prefill, and UI are shipped. Full Connect submission against an existing LIVE Custom account was not exercised (no such production fixture without altering financial records).

---

## 1. Architecture & field mapping (Phase A)

### Sources of truth

| Concept | Store | Notes |
|---------|-------|-------|
| Legal company | `supplier_profiles` (`company_legal_name`, `business_type`, `company_registration_number`, address_*, `vat_id`, `tax_id`, docs) | Business onboarding wizard + P9.18 trigger |
| Directors | `supplier_profiles.managing_directors` (newline-separated) | Structured in business UI; **not** auto-representative |
| Individual / representative | Stripe Person (when Connect exists); wizard draft `rep_*` in **sessionStorage** | Not a second company profile |
| Ownership % | Stripe Person `relationship.percent_ownership` (+ draft) | Not stored on `supplier_profiles` |
| Identity docs | Stripe (Custom Person / Express embed); Traverion `identity_document_path` is separate business KYC | |
| Bank | Stripe external account (token); legacy `payout_iban` unused by this wizard | |
| Preferences | `payment_cycle`, `payout_threshold_min` on profile | |

### Edge / RPCs

- `connect-supplier-onboarding` — `ensure_account`, `submit_business`, `submit_representative`, `accept_tos`, `attach_bank_token`, `refresh`, `account_session`
- Gate: `live_custom_onboarding_enabled` + `live_custom_onboarding_allowlist` (`_shared/live-custom-onboarding-gate.ts`)
- RPC: `claim_connect_account_create`

### Field mapping (abbrev.)

| Field | Source | Destination | Editable in payout wizard? |
|-------|--------|-------------|------------------------------|
| Legal name, type, reg, address | Business profile | Draft + (if account) Stripe business | Read-only when business locked |
| Phone | Profile | Profile (+ Stripe if account) | Yes |
| Directors | Business `managing_directors` | Profile SoT only | No (not reinvented as rep) |
| Rep name / DOB / contact | User entry / draft | Draft; Stripe Person if account | Yes — **never inferred from directors** |
| Ownership % | User entry | Draft; Stripe if owner | Yes when “owns shares” |
| TOS | Checkbox | Stripe if account | Yes |
| Bank IBAN | User entry | Stripe token attach if account | Yes |
| Prefs | User / profile | Profile | Yes |

Duplicate company profile: **avoided** — payout wizard prefills from profile and locks when under review/approved.

---

## 2. LIVE creation error — root cause (Phase D)

1. **Trigger:** Custom path `submit_representative` → `ensureConnectedAccount()` when no `stripe_connected_account_id`.
2. **Why on Representative:** Business previously called `ensure_account` / `submit_business` but **swallowed** gate failures (`turned off` / `not approved`) and still advanced.
3. **Supplier state (P918 cert):** no connected account.
4. **Platform:** LIVE Traverionapp; gate flag **0**; allowlist empty → refuse with `"LIVE payout account creation is turned off."`
5. **Draft without create:** yes — now the intended path.
6. **Restriction expected:** **yes** while production creation gate is OFF.

**Fix shipped:** never call `ensure_account` from business/rep continue; provider submit only when an account already exists; otherwise draft-first + supplier-friendly unavailable copy. Gate not bypassed.

---

## 3–5. Fixes shipped

| Area | Change |
|------|--------|
| Prefill | Company from profile; **no** director→rep name split; no DOB/ownership inference |
| Directors | Do not overwrite `managing_directors` with representative name |
| Ownership | Sanitize input; validate 0–100; require % only when owner; persist numeric 0 correctly |
| Defaults | `rep_is_owner=false`, empty % (do not force 100%) |
| Premature create | Removed ensure/create from continue path without existing account |
| UX copy | Friendly gate message via `connectOnboardingUserMessage` + banner |
| UI | ~800px content, sentence-case labels, `?` tips, two-column grids, inline field errors |

Commits: see git log for P9.20 (this report commit).

---

## 6. Certification

| Test | Result |
|------|--------|
| Ownership unit tests (0, 100, letters, >100, non-owner) | PASS |
| Hosted P918: empty rep (no director name invent), ownership inline error, Continue → Identity | **PASS** |
| Friendly “connection not available yet” (no raw LIVE gate string) | **PASS** |
| Directors unchanged (`Ada Lovelace\\nGrace Hopper`); `stripe_connected_account_id` still null | **PASS** |
| Existing Connect / Express live path | **BLOCKED** — no Connect rows in Traverionapp without inventing accounts |
| Desktop layout (~800px form, 2-col) | **PASS** |
| No LIVE create / transfer / payout execution | **PASS** (flags 0; no acct created) |

---

## 7. Remaining blockers

1. **LIVE Custom create gate OFF** — intentional; suppliers without an account stay in draft / “connection not available yet”.
2. **No production Connect fixtures** after prior wipe — cannot certify existing-account sync without creating accounts (forbidden without approval).
3. **Multi beneficial owners UI** — still single representative; additional owners when provider requires them remain a follow-up.
4. **Edge ownership** already 0–100; letters rejected client-side before submit.

---

## Safety

| Flag | Value |
|------|-------|
| `live_custom_onboarding_enabled` | 0 |
| `payout_execution_enabled` | 0 |
| `stripe_connect_transfers_enabled` | 0 |
| RN Express `acct_1UcAxbCOlSVGqrHJ` | Untouched |
