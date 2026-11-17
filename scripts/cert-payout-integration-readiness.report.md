# Payout Onboarding — Real Integration Readiness

| | |
|---|---|
| Verdict | **PARTIAL** |
| Commit | `fa0aae04` |
| Vercel deployment | **7869600758** |
| Cert base | `http://127.0.0.1:5185` |
| Checks | **13/13** (honesty + safety) |
| Screenshots | `scripts/payout-integration-screenshots/` |

## Executive summary

The payout wizard is **not** a full production Connect onboarding path yet. Finishing the wizard on LIVE saves **business** (already on `supplier_profiles`) and **preferences** server-side; representative / identity / bank markers were local-only. Verification stays not started and bank stays unconnected because **no Stripe Connect accounts exist** and LIVE create remains gated off — correctly, not as a UI bug.

This mission fixed **misleading statuses**, **fake bank-saved markers**, and **same-device draft persistence**. It did **not** enable LIVE Connect create, transfers, or payout execution.

---

## 1. Where submitted details are stored

| Data | Destination today | Survives logout / new device? |
|---|---|---|
| Business (legal name, type, address) | `supplier_profiles` (SoT) | Yes |
| Payout preferences | `supplier_profiles.payment_cycle`, `payout_threshold_min` | Yes |
| Representative / owners / DOB | Device draft (`localStorage` `tv-payout-wizard:v4:{userId}`) | Same browser profile only — **not** cross-device; **not** Stripe until Connect exists |
| Identity / TOS checkbox | Device draft (+ `financial_audit_log` only after Stripe `accept_tos`) | Same as above |
| Bank IBAN | **Not stored** by Traverion on draft-first LIVE. Full IBAN never written to draft. Tokenized to Stripe only after Connect attach | N/A until Connect |
| Wizard completion | Device draft `wizardCompletedAt` | Same device |
| Connect verification / bank link | Stripe Connect + mirrored `supplier_profiles.connect_*` | Yes, once an account exists |

**Change in this mission:** drafts moved from `sessionStorage` → durable **`localStorage`** (v4 key, migrates v1–v3). Still not a server KYC store.

---

## 2. Why verification stays “Not started”

1. Production has **0** `stripe_connected_account_id` rows.
2. `live_custom_onboarding_enabled = 0` and allowlist **empty** → edge refuses LIVE Custom create.
3. Client `canProvisionConnectAccount` is draft-first on LIVE without an existing account.
4. Review **Done** only sets local `wizardCompletedAt` — it does not create Connect or submit KYC to Stripe.

Provider verification **cannot** start until a connected account exists and Stripe reviews requirements.

**UI fix:** when local progress exists and Connect is absent, Settings / completion now show **“Details saved — connection not enabled”** / **“Connection not enabled”** instead of a bare “Not started” that looked like the user did nothing — without ever showing Verified.

---

## 3. Why bank remains unconnected

1. No Connect account → no `external_accounts`.
2. Prior bug: `bankSavedAt` was set on LIVE continue **without** tokenizing or storing IBAN → “Saved locally — not connected” was false.
3. **Fix:** draft-first bank continue sets `bankDeferredAt` only; `bankSavedAt` / `bankLast4` only after successful `attach_bank_token` (or already managed). UI: **“Not sent to provider”**.

---

## 4. Stripe Connect integration (what exists vs disabled)

**Operational (code path):**
- Edge `connect-supplier-onboarding` (ensure, business, representative, owners, TOS, bank token, account link/session, refresh)
- Mirror + webhook `account.updated` → `supplier_profiles.connect_*`
- TEST may provision; LIVE create gated by flag + allowlist
- Transfer / payout execution separately gated

**Production runtime (queried live):**

| Flag / state | Value |
|---|---|
| `live_custom_onboarding_enabled` | **0** |
| `live_custom_onboarding_allowlist` | **0** rows |
| `payout_execution_enabled` | **0** |
| `stripe_connect_transfers_enabled` | **0** |
| Connected accounts | **0** (live + test) |

---

## 5. End-to-end path to real payouts (not activated)

```
Business profile (Supabase)
  → Wizard collects rep / identity / bank (device draft until Connect)
  → Ops: allowlist supplier + live_custom_onboarding_enabled=1
  → ensure Connect Custom/v2 account
  → submit_business / representative / owners / accept_tos / attach_bank_token
  → Stripe requirements clear → connect_payouts_enabled + status complete (LIVE)
  → Separate approval: stripe_connect_transfers_enabled + payout_execution_enabled
  → Transfers / bank payouts
```

Nothing in this mission flips those flags.

---

## 6. Fixes shipped

- Honest verification + bank presentation helpers (`payoutVerificationPresentation`, `payoutBankPresentation`)
- Stop fake `bankSavedAt` on draft-first LIVE; add `bankDeferredAt` / `bankLast4`
- Draft persistence: `localStorage` v4 (+ migrate session/legacy)
- Completion / Review / Income settings copy no longer implies Verified or bank-on-file from local markers
- Safety gates left OFF

---

## 7. Still required to launch real payouts (explicit approval)

1. Matching LIVE Stripe secret + publishable keys; webhooks delivering `account.updated`
2. Allowlist one pilot supplier; set `live_custom_onboarding_enabled=1` only for controlled create
3. Complete Stripe onboarding until LIVE `details_submitted` / requirements clear / `payouts_enabled`
4. Separate decision to enable `stripe_connect_transfers_enabled` and `payout_execution_enabled`
5. Optional later: server-side non-secret progress (not full IBAN/DOB) for true cross-device KYC resume

---

## 8. Cert evidence

Authorized sandbox partner session against local Vite; production DB read-only gate audit; **no money moved**.

Screenshots: settings honest status, completion honest status, mobile 390.

**Verdict rationale:** honesty + safety **PASS**; real Connect verification / bank attach / payouts **still disabled** → **PARTIAL** (not FAIL, not PASS for “real payouts live”).
