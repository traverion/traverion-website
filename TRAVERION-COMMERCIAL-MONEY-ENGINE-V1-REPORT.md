# TRAVERION — COMMERCIAL MONEY ENGINE V1 REPORT

## 1. EXECUTIVE RESULT

**YES** — Traverion’s internal commercial accounting is safe enough that a new supplier can be assigned **15% Standard** or **18% Fast** terms and TEST bookings produce historically immutable, auditable, refund-safe economics.

Money truth is server-side (Postgres RPCs + ledger), integer minor units, checkout-frozen terms, immutable booking snapshots, net supplier earnings + `platform_commission`, earning-item payout eligibility, and `prepare_due_supplier_payouts` preparation (no bank transfer).

## 2. STARTING SHA

`fbf866736807d65a471f9cb9a366a3a8f2006124`

## 3. ENDING SHA

`b4d35e5515e9bbba9721f64f6ec1d5c4967e032d`

## 4. COMMITS

- `b4d35e5` — Build commercial money engine V1 (15% Standard / 18% Fast).

## 5. PUSH STATE

- **Git remote push:** not performed (mission: no unauthorized push).
- **Supabase `db push`:** migrations **238, 239, 240** applied to linked project `xcopqllkulxfkpunetbc`.
- **Edge deploy:** `admin-supplier-verification`, `create-booking-checkout-session` deployed (TEST Stripe unchanged).

## 6. DATABASE CHANGES

| Object | Purpose |
|--------|---------|
| `commercial_runtime_config` | `payout_hold_hours` (TEST default **0**; OWNER DECISION for production) |
| `supplier_commercial_terms` | Effective-dated plan history (standard/fast/custom/legacy_zero) |
| `booking_commercial_snapshots` | Immutable booking economics |
| `bookings.commercial_terms_id` | Checkout freeze pointer |
| `supplier_earning_items` | pending → eligible → included → paid / reversed |
| `supplier_payout_periods` + `_items` | Currency-safe payout prep (READY, no transfer) |
| RPCs | freeze / settle / reverse / shrink / refresh eligibility / prepare_due / admin set terms / mark paid |

## 7. COMMERCIAL TERMS MODEL

Authoritative catalog in `src/lib/commercial-money.ts` (`COMMERCIAL_PLANS`). DB stores `plan_code`, `commission_bps`, `payout_cadence`, effective window, `created_by`, `note`. Custom bps supported via `custom` without schema rewrite. Suppliers cannot write terms (RLS select-only; admin RPCs `service_role` only via admin edge).

## 8. STANDARD PLAN

- **Commission:** 15% (`1500` bps)
- **Payout cadence:** MONTHLY (intended run: **1st** UTC)

## 9. FAST PLAN

- **Commission:** 18% (`1800` bps)
- **Payout cadence:** SEMIMONTHLY (intended runs: **1st + 15th** UTC)

## 10. BOOKING SNAPSHOT MODEL

At checkout: `freeze_booking_commercial_terms` sets `bookings.commercial_terms_id`.  
At paid settle: `record_paid_booking_earnings` writes `booking_commercial_snapshots` (gross/commission/supplier/platform minors + remaining_* + plan/bps/cadence/terms_id) and posts ledger + earning item.  
Pre-engine bookings with existing `booking_earnings` are snapshotted as **`legacy_zero`** (honest 0% history) — never rewritten to 15%.

## 11. EXACT MONEY CALCULATION

Rule: `commission_minor = floor(gross_minor * bps / 10000)`; `supplier_minor = gross_minor - commission_minor`.

| Case | Gross | Commission | Supplier |
|------|------:|-----------:|---------:|
| €1,000 STANDARD | 100000 | 15000 (€150) | 85000 (€850) |
| €1,000 FAST | 100000 | 18000 (€180) | 82000 (€820) |
| €89.99 STANDARD | 8999 | 1349 (€13.49) | 7650 (€76.50) |
| €89.99 FAST | 8999 | 1619 (€16.19) | 7380 (€73.80) |

Proven in Vitest + remote `commercial_split_minor`.

## 12. SUPPLIER EARNINGS MODEL

`supplier_ledger_entries.kind = booking_earnings` posts **supplier entitlement (net)**, not GMV.  
`supplier_earning_items.amount_minor` tracks payout lifecycle. UI: Gross / Commission / Your earnings / Pending / Eligible / In payout prep / Paid.

## 13. PLATFORM COMMISSION MODEL

`supplier_ledger_entries.kind = platform_commission` (auditable Traverion revenue). Excluded from supplier Available in finance_summary / ledger balance helpers. Snapshot `remaining_commission_minor` is remaining platform entitlement.

## 14. REFUND MODEL

Full reverse: `reverse_paid_booking_earnings` + trigger on `refund` inserts → zeros remaining snapshot, reverses commission via adjustment (`:commission_rev`), marks earning item `reversed`, unlinks from unpaid payout periods. Distinguishes refund-due booking status vs Stripe refunded (existing paths preserved).

## 15. PARTIAL REFUND MODEL

`shrink_paid_booking_earnings(booking, remaining_gross)` recomputes split from **snapshotted bps** on remaining gross.  
Example: €1000 STANDARD → €200 refund → remaining €800 → commission €120 / supplier €680. Duplicate shrink stable. Remote fixture verified.

## 16. PAYOUT ELIGIBILITY MODEL

Earning starts `pending` until `eligible_at = experience_at + payout_hold_hours`.  
`booking_experience_at`: tours = `booking_date` + `start_time`; stays = `check_out` (Europe/Helsinki).  
Suppliers cannot mark eligible. Hold hours configurable; production duration is **OWNER DECISION** (TEST = 0).

## 17. PAYOUT PERIOD MODEL

`supplier_payout_periods` unique `(supplier_id, currency, period_key)`. Items unique on `earning_item_id`. Status: drafting/ready/processing/paid/failed/cancelled. Never sums currencies.

## 18. FUTURE CRON ENTRYPOINT

`prepare_due_supplier_payouts(p_now)` — service_role only:

1. refresh eligibility  
2. on cadence run days, create/reuse period  
3. lock eligible items → `included`  
4. set READY amount  

**No bank transfer.** Admin action `prepare_due_payouts` exposes it for TEST.

## 19. IDEMPOTENCY PROOF

- Snapshot settled short-circuit; ledger `(kind, source_id)` unique  
- Duplicate payment settle → `already: true` (fixture)  
- Duplicate shrink → same remaining  
- Duplicate prepare → unique period/item constraints  
- Commission reverse `on conflict do nothing`

## 20. CONCURRENCY PROOF

- Checkout freeze before pay; settle uses frozen `commercial_terms_id`  
- Terms change after freeze does not mutate prior snapshot (fixture: STANDARD booking stayed 1500 bps after FAST switch)  
- Period item unique prevents double inclusion  
- `FOR UPDATE` on mark-paid period  

## 21. SECURITY PROOF

- Terms/snapshots/items/periods: RLS select for admin or supplier-account-side; no client writes  
- `admin_set_supplier_commercial_terms` / `prepare_due` / `mark_paid`: **service_role only**  
- Admin edge still gated by assertAdmin; `commercialConfirm === true` required for terms set  
- Traveler never sees commission; cannot call admin RPCs  

## 22. ADMIN UI

Admin → **Commercial** tab: load supplier terms/history/economics, CONFIRM-gated plan change, prepare due payouts, list periods, mark READY paid (record only).

## 23. SUPPLIER UI

Income: plan line (STANDARD/FAST summary), Gross / Traverion commission / Your earnings / Pending / Eligible / In payout prep / Paid. “Contact Traverion to change payout plan.” Frontend does not invent rates.

## 24. TRAVELER IMPACT

None on price. Commission is supplier-side. Checkout amount unchanged.

## 25. LEGACY BOOKING MIGRATION

Existing paid bookings with pre-engine `booking_earnings` → settle path creates **`legacy_zero`** snapshot matching posted amount; **no** new 15% commission invented (migration 239). New bookings after activation use active supplier terms.

## 26. TEST RESULTS

- `src/lib/commercial-money.test.ts` — 12 passed  
- `src/lib/commercial-money-engine-v1.test.ts` — contract tests passed  
- Related money UI/shrink tests passed  
- Remote SQL fixture: STANDARD €1000 + FAST €1000 + partial refund + idempotent settle — **OK**

## 27. BROWSER VERIFICATION

Partner Income (EM Global Oy via temporary manager link for verify):

- Plan: **15% commission · Monthly payouts (1st)**  
- Gross **€1,800** / Commission **€300** / Earnings **€1,500** / Eligible **€1,500**  
- Ledger shows platform_commission €180 (FAST) and €120 (STANDARD after partial)  
- Collected rows: Commercial V1 STANDARD + FAST €1,000 bookings  

Admin Commercial tab: code shipped; browser admin session was signed out during verify (SQL admin_set exercised instead).

## 28. STRIPE TEST PROOF

Stripe remains TEST. Checkout freeze wired in `create-booking-checkout-session`. No LIVE keys. Fixture bookings used paid status + settle RPC (same path as webhook → `record_paid_booking_earnings`).

## 29. REMAINING OWNER DECISIONS

1. Production **post-activity hold** hours (`payout_hold_hours`)  
2. VAT/tax presentation  
3. Stripe fee absorption policy (fees not subtracted from supplier entitlement in V1; not falsely represented)  
4. Payout execution provider (manual bank vs Stripe Connect vs other)  
5. Legal supplier commercial agreement text  
6. Whether V1 payout execution is EUR-only (periods already currency-isolated)

## 30. EXACT NEXT MISSION FOR AUTOMATED PAYOUTS

**TRAVERION — AUTOMATED SUPPLIER PAYOUT EXECUTION**

Attach scheduler → `prepare_due_supplier_payouts` → execute provider transfer for READY periods → confirm → mark paid → notify → safe retry/escalation. Do not invent hold/VAT/fee policy in that mission without owner lock.

---

### €1,000 STANDARD lifecycle (YES proof)

1. Supplier on STANDARD 15% monthly  
2. Traveler pays €1,000 TEST → platform collects full gross  
3. Checkout freezes `commercial_terms_id`  
4. Webhook/promote calls `record_paid_booking_earnings` → snapshot 15000/85000; ledger booking_earnings €850 + platform_commission €150; earning item pending/eligible by experience+hold  
5. After experience (+ hold): `eligible`  
6. On 1st: `prepare_due_supplier_payouts` includes €850 in READY period (no transfer)  
7. Later mission / admin mark paid → `paid`  
8. Refunds before/after prep adjust via reverse/shrink with snapshotted bps  

**Final answer: YES**
