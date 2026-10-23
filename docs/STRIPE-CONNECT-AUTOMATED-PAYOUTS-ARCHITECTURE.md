# Traverion — Stripe Connect Automated Supplier Payouts

## Mission 1: Architecture & Compliance Audit

**Status:** Architecture only. No Stripe transfers, bank payouts, live money movement, or unreviewed financial deployment.  
**Baseline:** Phases 1–6 through migration 272; certification commit `0745c1f5`.  
**Date:** 2026-10-23

---

## 1. Current Stripe architecture audit

### 1.1 What exists today

| Layer | Reality |
| --- | --- |
| Customer payment | Stripe Checkout Session `mode: payment` on the **Traverion platform** Stripe account |
| Charge type | **Platform charge** (not Connect). No `transfer_data`, `destination`, `on_behalf_of`, or `application_fee_amount` |
| Capture | Instant for Tours; Stay Request-to-Book uses `capture_method: manual` then capture on host accept |
| Commission | **Internal only** — `booking_commercial_snapshots` + `supplier_ledger_entries.kind = platform_commission` |
| Supplier entitlement | `supplier_earning_items` (pending → eligible → included → paid/reversed) |
| Eligibility | Service completion + `payout_hold_hours` (48) + `booking_blocks_payout_eligibility` (holds, disputes, support cases, cancel resolution) |
| Payout periods | Internal `supplier_payout_periods` READY/PAID; admin mark-paid requires payment confirmation reference |
| Bank details | Supplier IBAN/BIC + Traverion verification status — **no Stripe connected account IDs** |
| Refunds | `execute-booking-refund` → `stripe.refunds.create` on platform PaymentIntent + durable instructions |
| Connect code | **None** in repo (no transfers/payouts APIs) |

### 1.2 Which account receives customer money

Customer card payments settle into the **platform Stripe balance** (`pending` → `available` on Stripe’s rolling schedule, typically ~2 business days depending on country/account). They are **not** credited to any supplier Stripe account.

### 1.3 Are payments “transferable later”?

Technically, under **Separate charges and transfers**, funds that remain in the **platform available balance** can later be transferred to connected accounts. That is **not** guaranteed by Traverion’s ledger “paid” status:

- Platform **automatic bank payouts** (Stripe → Traverion bank) reduce available balance and can leave insufficient funds for supplier transfers.
- Refunds and disputes debit the **platform** balance first under this model.
- A booking marked paid in Postgres only proves a PaymentIntent succeeded — not that earmarked cash still sits in Stripe available balance.

### 1.4 Stripe fees

Stripe processing fees are assessed on the **platform**. Traverion does **not** currently persist Stripe fee balance transactions into the supplier ledger. Supplier-net is commission-split of **customer gross**, not “gross − Stripe fee − commission.”

### 1.5 Current-state funds flow

```text
Customer
   │  Checkout / PaymentIntent (platform account)
   ▼
Traverion Stripe balance (pending → available)
   │
   ├─► Stripe fees (platform)
   ├─► Customer refunds / disputes (platform)
   ├─► Platform bank payout (Stripe → Traverion operating account)  [automatic schedule]
   │
   └─► Traverion Postgres ledger
         booking_commercial_snapshots
         supplier_earning_items / supplier_payout_periods
         (NO Stripe Transfer / NO Connect Payout)

Supplier today: IBAN on file → manual/external payout evidence → admin_mark_payout_period_paid
```

### 1.6 Connected accounts

Code and schema search: **no** `stripe_account_id` / `acct_` storage. Existing IBAN verification is Traverion-operated, not Stripe Connect KYC.

---

## 2. Connect model comparison

Official charge types: [Understand Connect charges](https://docs.stripe.com/connect/charges).

| Criterion | A. Separate charges & transfers (SCAT) | B. Destination charges | C. Direct charges |
| --- | --- | --- | --- |
| Fit with **existing** platform-captured PIs | **Best** — charges already on platform; transfers added later | Would require new charge shape (`transfer_data` / destination) at checkout | Incompatible without rewriting checkout onto connected accounts |
| Delayed earnings (after service) | **Native** — charge now, transfer later | Funds move to connected account at charge time (too early for Traverion) | Funds land on connected account immediately |
| Multiple bookings → one payout | **Native** — aggregate transfer from platform balance | Awkward (per-charge destination) | Awkward |
| Holds / debt netting | Platform decides transfer amount after eligibility | Harder once funds already on connected account | Harder |
| Refunds / chargebacks | Debit **platform**; recover via transfer reversal / future earnings | Debit platform; reverse transfer | Debit **connected** account |
| Commission retention | Keep delta on platform (never transfer commission) | Application fee / reduced transfer | Application fee |
| Stripe fees | Platform pricing plan | Platform | Configurable |
| Complexity | Higher (transfer + payout engines, balance monitoring) | Medium | High migration cost |
| FI support | SCAT supported in **Finland** ([SCAT regions](https://docs.stripe.com/connect/separate-charges-and-transfers)) | Supported with regional constraints | Requires `card_payments` on connected accounts |

### Recommendation (technical)

**Adopt Separate charges and transfers (SCAT)** on top of the existing platform-captured Checkout/PaymentIntent architecture.

**Do not** migrate historical or new bookings to destination or direct charges for supplier payouts — that would either pay suppliers before service completion or force a checkout rewrite.

**Controller / liability posture (for Connect account configuration):** marketplace-style platform that remains responsible for negative balances on connected accounts when using SCAT (Stripe docs recommend SCAT when the platform is responsible for connected-account negative balances). Exact Accounts v2 `controller` / `defaults.responsibilities` values require owner confirmation with Stripe.

---

## 3. Finnish / EU compliance considerations

### 3.1 Technical capability (Stripe docs)

- SCAT is listed for **Finland** among supported regions.
- Manual connected-account payouts: funds must be paid out within **90 days** for “all other countries” (includes Finland / typical EEA), per [manual payouts](https://docs.stripe.com/connect/manual-payouts) and [account balances — holding funds](https://docs.stripe.com/connect/account-balances).
- Stripe explicitly: **“Escrow has a precise legal definition, and Stripe doesn’t provide escrow services.”** Manual payouts / delayed transfers are **not** escrow.
- Cross-border EEA transfers: supported between US/CA/UK/EEA/CH in documented corridors; otherwise same-region constraints apply ([SCAT](https://docs.stripe.com/connect/separate-charges-and-transfers)).
- Auto-debit of connected-account bank for negative balances is supported in SEPA countries **only if** `debit_negative_balances` is enabled — Traverion policy should default **off** unless separately authorized.

### 3.2 Legal authorization (not technical)

The following are **not** decided by engineering and need Stripe + qualified Finnish/EU legal/accounting advice:

1. Whether Traverion’s marketplace activity requires a payment-institution / agent-of-payee / exemption posture under PSD2 / Finnish implementation.
2. Whether holding customer funds on the platform until service completion (weeks–months) is permitted under Traverion’s Stripe Connect platform agreement and local law.
3. VAT/invoicing: payout statements must remain **non-VAT invoices** unless tax counsel designs otherwise (current Phase 6 stance).
4. Whether suppliers are “merchants of record” for any portion of the customer relationship (statement descriptor / `on_behalf_of` implications).
5. Cross-border suppliers outside EEA corridors.

**Flag:** Do not market platform-held balances as “escrow.”

---

## 4. Long-lead booking fund-flow solution

### Problem

Sale in September for a December service: Traverion eligibility may withhold supplier earnings for **>90 days**. Stripe’s connected-account **manual payout hold ceiling is 90 days** (Finland/EEA typical). Therefore Traverion **must not** transfer unearned funds to the connected account months early and “park” them there.

### Compliant pattern (recommended)

```text
Charge (platform) ──► Platform Stripe balance
                         │
                         │  keep funds on PLATFORM until:
                         │  service complete + clearance + no holds + payout date
                         │
                         ▼
              Transfer (SCAT) → Connected account available
                         │
                         │  shortly after transfer (hours–days), not months
                         ▼
              Payout API → Supplier bank
```

**Liquidity rules**

1. **Do not** transfer at booking time.
2. **Do** manage **platform** payout schedule / reserves so enough `available` balance remains to cover upcoming supplier transfer batches + refund buffer + Stripe fees.
3. Optionally associate transfers with `source_transaction` (Charge/PI) when paying out per-booking; for **aggregated** monthly periods, transfer from platform available with ledger linkage to many booking IDs (monitor balance carefully — Stripe allows transfers not strictly equal to a single charge under SCAT, with platform liability).
4. **Funds segregation** (`allocated_funds`) is a **private preview** and the published country list at audit time **does not include Finland**. Do not depend on it for FI launch; treat as future enhancement if Stripe enables FI.

### Refunds during long hold

While funds remain on the platform: refund the PaymentIntent as today; reverse/shrink earning items; no Connect transfer to reverse.

After transfer: refund still hits platform; recover via `TransferReversal` and/or `supplier_recovery` against future periods (existing Phase 5 debt netting).

---

## 5. Supplier onboarding design

### 5.1 Target

Stripe Connect **Accounts v2** with Stripe-hosted or embedded onboarding (Account Links / Connect embedded components), collecting identity + external bank account. Prefer **not** storing raw IBAN in Traverion once Connect is live (migrate off `payout_iban` as source of truth).

### 5.2 Flow

1. Supplier opens Income → Settings → “Connect payouts”.
2. Backend creates/links `stripe_connected_account_id` on `supplier_profiles`.
3. Stripe-hosted onboarding collects KYC + bank.
4. Webhooks: `account.updated` / capability status → mirror `connect_onboarding_status`, `payouts_enabled`, `charges_enabled`, `requirements`.
5. Restricted accounts: block automatic transfers; show dashboard reason + re-onboarding link.
6. Country/currency: account country drives payout currency; Traverion continues EUR-first with explicit multi-currency later.

### 5.3 Migration of existing suppliers

- Keep historical `supplier_earning_items` / periods / statements.
- Dual-write period: Traverion IBAN verification remains for ops until Connect `payouts_enabled`.
- Cutover flag per supplier: `payout_rail = 'manual_iban' | 'stripe_connect'`.
- No earnings history rewrite.

---

## 6. Automatic transfer engine (design)

Cron (service-role), per payout cadence day:

1. `refresh_supplier_earning_eligibility`
2. Select due suppliers (cadence + scheduled_for)
3. Skip if Connect not `payouts_enabled` / requirements due
4. Skip supplier-wide risk holds (`fraud_review`, `verification`, `manual_review`)
5. Lock eligible items into period (existing prepare) with debt netting (`supplier_outstanding_recovery_minor`)
6. **Reserve** period amount in DB (`status = transfer_pending`, row lock / `FOR UPDATE`)
7. Preflight: platform `Balance.available` ≥ net + buffer
8. `stripe.transfers.create` with idempotency key `transfer:{period_id}:{attempt}`
9. Persist `stripe_transfer_id`, amount, currency, balance_transaction
10. Webhook `transfer.created` / `transfer.reversed` / failures → update attempt
11. Optionally create connected-account **Payout** (or rely on connected automatic payouts) with separate idempotency `payout:{period_id}:{attempt}`
12. Only after payout confirmation events → period `bank_paid` + statement generation
13. Exceptions → admin queue (insufficient platform balance, restricted account, partial failure)

**Normal path: no human approval.**

---

## 7. Transfer vs bank payout status model

| Traverion status | Meaning | Stripe proof |
| --- | --- | --- |
| `earnings_eligible` | Cleared item | Internal only |
| `period_prepared` | READY period locked | Internal |
| `transfer_pending` | API attempt in flight | Idempotent Transfer create |
| `transfer_completed` | Funds on connected account | Transfer `paid`/`id` + BT |
| `connect_funds_available` | Connected available ≥ amount | Connected Balance retrieve |
| `bank_payout_pending` | Payout object created | Payout `pending`/`in_transit` |
| `bank_payout_paid` | Money left Stripe to bank | Payout `paid` + `arrival_date` |
| `bank_payout_failed` | Payout failed | Payout `failed`/`canceled` |
| `reversed` / `adjusted` | Transfer reversal / debt | TransferReversal + ledger |

**Never** set supplier-facing “Paid” from Transfer success alone — that is only `transfer_completed`.

---

## 8. Refunds after transfers

| Scenario | Handling |
| --- | --- |
| Refund before transfer | Existing refund pipeline; reverse/shrink earnings; unlink READY items |
| Refund while transfer pending | Cancel/block attempt if possible; else reverse after transfer lands |
| Refund after transfer | Platform refund + `transfers.createReversal` (partial/full) + recovery ledger if shortfall |
| Refund after bank payout | Same + `supplier_recovery`; future period netting; **no** silent bank debit unless `debit_negative_balances` explicitly approved |
| Chargeback | Platform liability under SCAT; mirror dispute holds; recover as above |
| Double application | Idempotent keys on refund instruction, reversal, recovery (`kind, source_id`) |

---

## 9. Idempotency & concurrency

| Object | Idempotency / uniqueness |
| --- | --- |
| Payout period | `(supplier_id, currency, period_key)` |
| Transfer attempt | `transfer:{period_id}:{n}` + unique `stripe_transfer_id` |
| Payout attempt | `payout:{period_id}:{n}` + unique `stripe_payout_id` |
| Refund | Existing `cancel-refund:{booking_id}` |
| Transfer reversal | `trrev:{transfer_id}:{refund_id}` |
| Debt apply | `payout-debt-apply:{period_id}` (Phase 5) |

Boundaries: single DB transaction for reserve; Stripe call outside; reconcile via webhook + poll. Timeouts after Stripe success → webhook/list Transfer by metadata. Duplicate cron → unique period + attempt status.

---

## 10. Supplier Income integration

Preserve Overview **only**:

1. Period Sales  
2. Period Earnings  

| Tab | Connect-era behavior |
| --- | --- |
| Earnings | Unchanged eligibility semantics; show “transfer scheduled / held” |
| Payouts | Show transfer vs bank statuses separately; estimated date = period `scheduled_for` |
| Documents | Statements only when `bank_payout_paid` (or explicitly confirmed manual rail) |
| Settings | Connect onboarding status; mask bank via Stripe; disable misleading “active automatic bank payouts” until rail live |

---

## 11. Scale & operations (1k–10k+ suppliers)

- Queue workers (Supabase Edge + cron shards by `supplier_id % N`)
- Stripe rate-limit aware batching (transfers/payouts)
- Metrics: success rate, insufficient_balance, restricted_account, reversal rate
- Alerts: platform available < next 7d obligation; webhook lag; failed attempts > threshold
- Admin exception dashboard only
- Full audit log of attempts and Stripe IDs

---

## 12. Deliverable summaries

### Database migration plan (future, not in this mission)

1. `supplier_profiles.stripe_connected_account_id`, onboarding/capability mirrors, `payout_rail`
2. `supplier_payout_transfer_attempts`, `supplier_payout_bank_attempts`
3. Extend `supplier_payout_periods` with transfer/payout IDs and fine statuses
4. Optional `stripe_balance_snapshots` for reconciliation
5. RLS: suppliers read own Connect status; service_role writes

### Edge / webhook plan

- `connect-supplier-onboarding` (Account Link session)
- Extend `stripe-webhook`: `account.updated`, `transfer.*`, `payout.*`, `charge.dispute.*` (already partial)
- `execute-supplier-transfers` cron (disabled until authorized)
- Keep `refresh-supplier-earnings` eligibility-only until transfer engine ships

### Stripe TEST certification plan

1. Connected account onboarding TEST  
2. Platform PI → eligibility → transfer → connected balance  
3. Connected payout → `payout.paid`  
4. Refund before/after transfer + reversal  
5. Duplicate cron / webhook replay  
6. Insufficient platform balance failure path  
7. Restricted account skip  
8. Negative balance / recovery across periods  
9. Statement only after bank confirmation  

### Risks & unresolved questions

| Risk | Severity |
| --- | --- |
| Platform bank payout drains transfer liquidity | High |
| Lead times >90 days if funds parked on connected accounts | High — solved by platform hold |
| Funds segregation unavailable in FI | Medium |
| PSD2 / marketplace licensing | High — legal |
| Describing holds as escrow | High — compliance wording |
| Stripe fee vs commission accounting | Medium |
| `debit_negative_balances` without consent | High — keep off |
| Accounts v1 vs v2 migration | Medium |

### Owner decisions required

1. Approve **SCAT** as the Connect charge/transfer model.  
2. Approve **platform-balance hold until eligibility** for long-lead bookings.  
3. Approve Connect account controller / loss liability settings with Stripe.  
4. Approve whether connected accounts use **manual** or **automatic** payouts after transfer.  
5. Approve **no** auto bank debit for negative balances at launch.  
6. Engage counsel on PSD2 / fund-holding / tax.  
7. Authorize implementation stages below.

---

## 13. Staged implementation roadmap

| Stage | Scope | Money movement |
| --- | --- | --- |
| **0 — this mission** | Architecture + compliance audit | None |
| **1** | Schema + Connect onboarding + webhooks (TEST) | None to suppliers |
| **2** | Transfer engine behind feature flag; Stripe TEST only | TEST transfers only |
| **3** | Bank payout confirmation + Income UI statuses + statements | TEST payouts |
| **4** | Liquidity monitoring, reserves, admin exception queue | Still TEST |
| **5** | Limited live pilot (named suppliers) | Live — needs explicit go-live |
| **6** | Full automatic production | Live |

**Stop condition for Mission 1:** no transfer/payout implementation or live money movement until stages are explicitly authorized.

---

## Official documentation references

- [Connect charges overview](https://docs.stripe.com/connect/charges)
- [Separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers)
- [Destination charges](https://docs.stripe.com/connect/destination-charges)
- [Direct charges](https://docs.stripe.com/connect/direct-charges)
- [Account balances / holding funds](https://docs.stripe.com/connect/account-balances)
- [Manual payouts](https://docs.stripe.com/connect/manual-payouts)
- [Funds segregation (private preview)](https://docs.stripe.com/connect/funds-segregation)
- [Cross-border payouts](https://docs.stripe.com/connect/cross-border-payouts)

---

## Appendix — code anchors (audit)

- Checkout: `supabase/functions/create-booking-checkout-session/index.ts` (`checkout.sessions.create`, platform PI metadata)
- Webhooks: `supabase/functions/stripe-webhook/index.ts` (PI succeeded/failed, `charge.refunded`, disputes)
- Refunds: `supabase/functions/execute-booking-refund/index.ts`
- Commercial split: `supabase/migrations/238_commercial_money_engine_v1.sql`
- Eligibility / debt / periods: migrations `270`, `271`
- Income UI: `src/pages/supplier/SupplierEarnings.tsx` (Period Sales / Period Earnings)
