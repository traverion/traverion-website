# P9.25 — Income & Payouts Final Certification

**Verdict: PARTIAL PASS**

Populated Earnings + Overview clearance math certified on authorized **partner-demo staging** (`aurora-ops@partner-demo.traverion.invalid`). Confirmed payout history / Documents statements still have **no authorized period fixtures** on staging or production — covered by unit/fixture tests only. **Production populated history is not certified.**

## Ship

| Item | Value |
|------|--------|
| Continues from | `b1ee570a` |
| Implementation | `8a28f2c4` · Vercel **7864214499** |
| Host (prod) | https://partner.traverion.com/partner/money |
| Staging cert | Vite `127.0.0.1:5174` + `.env.partner-demo.local` |

## Safety

| Control | Status |
|---------|--------|
| LIVE Accounts v2 create | Untouched / OFF |
| `payout_execution_enabled` | Untouched |
| Production ledger writes | **None** |
| Financial calc / commission / refund logic | Untouched |

## Changes in this mission

1. **`formatIncomeMoney`** — Income & Payouts always shows two fraction digits (`€0.00`, `€38.25`) without changing traveler `formatMoney`.
2. **Overview payout account** — uses `connectOnboardingLabel` (same as Settings). Stops legacy `payout_verification_status === 'verified'` from showing **Verified** when Connect is `not_started`.
3. **Settings** — remove redundant per-field help tips; keep section-level help.
4. **`supplier-income-p925.cert.test.ts`** — Aurora-shaped fixtures for statuses, sums, documents gates, formatting.

## Certification matrix

| Surface | Result | Evidence |
|---------|--------|----------|
| Overview (staging, pending earnings) | **PASS** | €0.00 eligible · €76.50 awaiting (2 bookings) · Payout account **Not started** |
| Earnings table (staging) | **PASS** | 3 rows: Reversed €0.00 + 2× Pending €38.25; filters + pagination chrome |
| Earnings mobile 390 | **PASS** | Card list + statuses readable |
| Payouts list | **PASS (empty)** | Compact empty — staging has 0 payout periods |
| Documents | **PASS (empty)** | Compact empty — no confirmed periods |
| Settings | **PASS** | Not started · bank empty · Monthly / 100 EUR |
| Populated payout/Documents rows | **PARTIAL** | Unit/fixture only (`payoutMaySayPaid`, statement gates) |
| Production populated history | **Not certified** | Prod still 0 earnings/payout rows; no artificial ledger writes |

## Tests / build

- `supplier-income-p925.cert.test.ts`, `money.test.ts`, overview/phase6/empty/settings certs — PASS  
- `tsc` target clean  
- `npm run build` — PASS  

## Screenshots

`scripts/p925-screenshots/`

## Remaining blockers

1. No authorized **confirmed payout period** fixture on staging/production → cannot browser-cert Documents/Payouts populated rows without inventing ledger data.
2. Production populated history remains uncertified until real supplier activity exists.

## Next

Stop after deploy ID is recorded. Do not invent production payout periods.
