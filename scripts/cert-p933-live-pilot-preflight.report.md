# P9.33 — LIVE Connect Pilot Preflight

| | |
|---|---|
| Verdict | **APPROVAL REQUIRED** (preflight PARTIAL) |
| Date | 2026-11-18 |
| Production project | `xcopqllkulxfkpunetbc` (Traverionapp) |
| Actions taken | **None** — no gate change, no allowlist write, no Connect create, no money movement |

---

## Recommended supplier (first LIVE pilot)

| Field | Value |
|---|---|
| **Supplier ID** | `eced0f8c-c2e4-469b-8bba-15170be68cc1` |
| Legal name | **EM Global Oy** |
| Login email | `contact@royalnordic.fi` |
| Owner team role | `owner` (user_id = supplier_id) |
| Country | **FI** |
| Business type | `company` |
| Registration | `3567289-4` |
| VAT | `FI35672894` |
| Address | Siljotie 2 D7, 96100 Rovaniemi, FI |
| Managing director | Miro Vesterinen |
| Contact phone | `+358458803060` |
| Connect account | **None** |
| Legacy Connect id | **None** |
| Create claim | **None** |
| Traverion business status | `pending` (submitted) |
| Pilot approval row | **0** |

**Why this ID:** It is the only current production profile with a **real Finnish legal entity** and **no Connect account**. Traverion cert accounts (`@traverion.invalid`) are controlled but use synthetic Y-tunnus values that cannot complete genuine LIVE Stripe verification.

**Why not fully GO yet:** Eligibility helper requires Traverion business `verified` plus admin owner/Stripe acknowledgements before allowlisting. Those are still open (see prerequisites).

---

## 1. Traverion-controlled supplier inventory

| Supplier ID | Name | Email | Controlled? | LIVE KYC-ready? | Connect | Notes |
|---|---|---|---|---|---|---|
| `eced0f8c-c2e4-469b-8bba-15170be68cc1` | EM Global Oy | contact@royalnordic.fi | Founder-owned login | **Yes (entity)** | None | **Recommended candidate** |
| `a912ec92-660c-4d6e-9438-4506107b0500` | P921 Test Supplier Oy | p921-…@traverion.invalid | Yes (cert) | **No** — Y-tunnus `1234567-1` | None | Wizard draft present; synthetic entity |
| `635efbf3-41c4-4a42-9039-4586f046c090` | P922 TEST Supplier Oy | p922-…@traverion.invalid | Yes (cert) | **No** | None | Stale `connect_create_claimed_at` (~8h); clear before any use of this id |
| `be0f0169-26c4-4d74-90b0-69328cb929a8` | P918 Arctic Tours Oy | p918-…@traverion.invalid | Yes (cert) | **No** | None | Synthetic |
| `718ae3a5-ac82-4289-834e-a0ae960e3089` | P9161 Browser Legal Oy | p9161-…@traverion.invalid | Yes (cert) | **No** | None | Synthetic; empty directors |

Historical note: P9.11 Royal Nordic id `9e42bd3a-…` (LIVE Express) is **not** in the current five-profile set. Do not revive that Express path for this pilot.

---

## 2. Entity / ownership / Connect checks (recommended id)

| Check | Result |
|---|---|
| Legal name present | PASS — EM Global Oy |
| Country FI | PASS |
| Business type company | PASS |
| Phone present | PASS |
| Owner login matches profile | PASS |
| No `stripe_connected_account_id` | PASS |
| No `connect_legacy_account_id` | PASS |
| No open create claim (<2 min) | PASS |
| Traverion business verified | **FAIL** — still `pending` |
| `live_accounts_v2_pilot_approvals` row | **FAIL** — 0 |
| Admin owner + Stripe ack checkboxes | **Not recorded** |

---

## 3. Production Stripe / webhook / permission preflight

| Check | Result |
|---|---|
| `STRIPE_SECRET_KEY` present | PASS |
| `STRIPE_LIVE_PAYMENTS_ENABLED` = 1 (hash match) | PASS — platform money mode is LIVE-capable |
| `VITE_STRIPE_PUBLISHABLE_KEY` present | PASS (edge secret; must remain pk_live for LIVE bank tokens) |
| Webhook secrets (base / LIVE / TEST / Connect LIVE / Connect TEST) | PASS — all present |
| `connect-supplier-onboarding` | ACTIVE v32 |
| `stripe-webhook` | ACTIVE v116 |
| `execute-supplier-transfers` | ACTIVE — **hard-refuses LIVE** (`stripeMoney.mode !== 'test'` → 503) |
| Allowlist table RLS | Service-role only (unchanged) |
| Frontend local `.env` | Still pk_test / sk_test for local Vite — production edge uses LIVE secrets |

---

## 4. Money / create safety (must stay disabled for this mission)

| Flag / control | Value | Required for pilot create window |
|---|---|---|
| `live_custom_onboarding_enabled` | **0** | Flip to 1 only after explicit approval |
| `live_custom_onboarding_allowlist` | **0 rows** | Insert **only** recommended id |
| `payout_execution_enabled` | **0** | **Keep 0** |
| `stripe_connect_transfers_enabled` | **0** | **Keep 0** |
| `payout_auto_prepare_enabled` | **0** | Keep 0 |
| `payout_pilot_prepare_enabled` | **0** | Keep 0 |
| Transfer executor LIVE block | Enforced in code | Independent of DB flag |

**Verified this session:** gate still 0; allowlist still empty; no Connect accounts created.

---

## 5. Rollback controls (ready)

1. Set `live_custom_onboarding_enabled` back to **0** immediately after create (or on any anomaly).
2. Delete the single allowlist row for `eced0f8c-c2e4-469b-8bba-15170be68cc1`.
3. Do **not** enable transfers or payout execution.
4. Existing Connect account (if created) is reused by claim logic — closing the gate does not delete the Stripe account; it only blocks new creates.
5. If Stripe created an account that failed to link to the profile: stop; retrieve read-only; do not invent a second account.

---

## 6. Exact activation procedure (DO NOT RUN until approved)

### Prerequisites (before allowlist)

1. Approve Traverion business verification for `eced0f8c-c2e4-469b-8bba-15170be68cc1` (or confirm genuine evidence already on file).
2. Admin **LIVE v2 pilot** → Assess → record `live_accounts_v2_pilot_approvals` with owner + Stripe acknowledgement checkboxes (does **not** allowlist).
3. Confirm founder authorization to create a **real** LIVE Accounts v2 connected account for EM Global Oy.
4. Confirm production publishable key used by partner.traverion.com matches LIVE (`pk_live_…`) for bank tokenization after create.

### Activation (separate explicit approval)

```sql
-- 1) Allowlist ONLY this supplier (service role)
insert into public.live_custom_onboarding_allowlist (supplier_id)
values ('eced0f8c-c2e4-469b-8bba-15170be68cc1');

-- 2) Open create gate for a controlled window
update public.commercial_runtime_config
set value_int = 1
where key = 'live_custom_onboarding_enabled';
```

3. Supplier signs in at `partner.traverion.com` → Income & Payouts → continue Business once → `ensure_account`.
4. Verify profile: `stripe_connected_account_id` set, `connect_account_livemode = true`, type custom/v2.
5. **Close gate in the same session:**

```sql
update public.commercial_runtime_config
set value_int = 0
where key = 'live_custom_onboarding_enabled';

delete from public.live_custom_onboarding_allowlist
where supplier_id = 'eced0f8c-c2e4-469b-8bba-15170be68cc1';
```

6. Leave `payout_execution_enabled` and `stripe_connect_transfers_enabled` at **0**.

---

## 7. APPROVAL REQUIRED

| Item | Value |
|---|---|
| Proposed pilot supplier ID | **`eced0f8c-c2e4-469b-8bba-15170be68cc1`** |
| Legal entity | EM Global Oy (FI) |
| Immediate blockers before allowlist | Business still `pending`; no pilot approval row; founder ack for real Stripe KYC |
| This mission | Did **not** enable create, did **not** write allowlist, did **not** move money |

**Reply with explicit approval** of supplier id `eced0f8c-c2e4-469b-8bba-15170be68cc1` (and confirmation that prerequisites 1–4 are done) before any allowlist insert or gate flip.
