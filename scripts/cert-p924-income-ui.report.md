# P9.24 — Income & Payouts Premium UI Refinement

**Verdict: PARTIAL PASS**

Zero-data, Settings redesign, error distinction, and responsive layouts are certified. Live populated earnings/payouts regression could not be browser-certified because production has **zero** `supplier_earnings` / `supplier_payout_periods` rows (no authorized fixture invented).

## Production deployment

| Item | Value |
|------|--------|
| Ship | _(filled after push)_ |
| Host | https://partner.traverion.com/partner/money |
| Local cert host | http://127.0.0.1:5173/partner/money |

## Safety (unchanged)

| Control | Status |
|---------|--------|
| LIVE Accounts v2 create | OFF |
| `payout_execution_enabled` | 0 |
| `stripe_connect_transfers_enabled` | 0 |
| Royal Nordic Express `acct_1UcAxbCOlSVGqrHJ` | Not touched |
| Financial calcs / ledger / commission / refunds | Not modified |

## What changed (presentation only)

1. **Overview** always renders the existing payout-focused dashboard after a successful load — including €0 metrics and compact “No completed payouts yet”. Removed page-level “Nothing collected yet” empty card.
2. **Earnings / Payouts / Documents** keep filters, headers, and table chrome; compact in-list empty copy when zero rows.
3. **Settings** premium three-card layout (Payout account status panel, Bank empty/connected, Preferences two-column) with primary **Set up payouts**.
4. Failed money loads stay on **Money unavailable** ErrorState — never painted as success zeros.

## Certification matrix

| Scenario | Result | Evidence |
|----------|--------|----------|
| **A** New supplier, zero financial activity | **PASS** | Disposable `p921-payout-mwkvnn8d@traverion.invalid`. All five tabs visually inspected (desktop). Screenshots `scripts/p924-screenshots/A-*-desktop.png`. |
| **B** Supplier with earnings/payout history | **PARTIAL** | Prod DB: 0 earnings, 0 payout periods, 0 paid bookings. No authorized fixture written. Populated table/row branches preserved in source (`pageRows.map`, period list). Unit/cert tests green. |
| **C** Financial API failure | **PASS** | Blocked income REST/RPC → **Money unavailable** + Try again; Overview dashboard not shown as €0. `C-money-api-failure.png`. |
| **D** Incomplete payout onboarding | **PASS** | Settings: Status **Not started**, bank empty, preferences Monthly / 50 EUR; **Set up payouts** opens existing 6-step wizard (step 2 Representative). |
| Mobile 390 | **PASS** | Overview, Earnings, Settings screenshots. |
| Tablet 768 | **PASS** | Overview screenshot. |

## Unit / static

- `money-empty-cta-1647.test.ts` — PASS  
- `supplier-income-phase6.cert.test.ts` — PASS  
- `income-financial-settings-presentation.test.ts` — PASS  
- Target `tsc` for SupplierEarnings / IncomeFinancialSettings — clean  

## Before / after

| Before | After |
|--------|-------|
| Zero sales → large page empty “Nothing collected yet” | Full Overview dashboard with €0 + sections |
| Earnings/Payouts often empty-card heavy | Filters + table chrome + compact empty row |
| Settings visually unfinished | Three structured cards, status panel, consistent actions |

Screenshots: `scripts/p924-screenshots/`.

## Remaining

1. Browser-cert **B** when an authorized supplier with real earnings/payouts exists (do not invent ledger rows).
2. Integer amounts still format as `€0` via existing `formatMoney` (not `€0.00`); same as the rest of Partner money UI.

## Next

Stop here after deploy ID is recorded.
