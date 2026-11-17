# P9.25 — Income & Payouts Final Certification (completed blockers)

**Verdict: PARTIAL PASS**

Staging populated **Payouts** + **Documents** browser-certified with an authorized isolated partner-demo fixture.  
**Production populated-history certification: BLOCKED — NO DATA** (0 payout periods / 0 earnings; no production ledger rows invented).

## Ship

| Item | Value |
|------|--------|
| Continues from | `8a28f2c4` / earlier P9.25 |
| Implementation | `45b5ea6f` · Vercel **7864485085** |
| Staging | Vite `127.0.0.1:5174` + `.env.partner-demo.local` (`gedktutbpfwnstcbffsc`) |
| Fixture supplier | `aurora-ops@partner-demo.traverion.invalid` · `a11ce001-d000-4000-8000-000000000001` |
| Seed script | `scripts/cert-p925-seed-demo-payout-fixture.mjs` (`ALLOW_PARTNER_DEMO_CERT_FIXTURE=1`) |

## Safety

| Control | Status |
|---------|--------|
| Production ledger / payout periods | **Untouched** (count remains 0) |
| Stripe payout / transfer execution | **Not run** |
| `supplier_earning_items` balances/statuses | **Unchanged** (still 2× pending 3825 + 1 reversed) |
| Fixture scope | partner-demo project only; period_keys `p925-cert-*` |

## Fixture (authorized, isolated, presentation-only)

| period_key | status | amount | paid_at | connect_lifecycle |
|------------|--------|--------|---------|-------------------|
| `p925-cert-2026-10` | paid | €101.15 | 2026-11-05 | `bank_payout_paid` |
| `p925-cert-2026-11-ready` | ready | €38.25 | null | `internal_only` |

Note on rows: `P9.25 cert fixture — presentation only; no Stripe payout executed`.

## Browser certification (staging)

| Check | Result | Evidence |
|-------|--------|----------|
| Payouts desktop | **PASS** | Upcoming €38.25 + Paid to bank €101.15 |
| Payouts mobile 390 | **PASS** | Same two rows, amounts/status readable |
| Documents desktop | **PASS** | Statement + confirmation for paid period only; READY excluded |
| Documents filter | **PASS** | Statements-only / Confirmations-only |
| Document View | **PASS** | Opens statement blob PDF tab |
| Overview last completed | **PASS** | `p925-cert-2026-10 · cert_fixture` · Paid to bank €101.15 |
| Partner isolation | **PASS** | `p925-cert-*` rows only on aurora supplier id |
| Production populated history | **BLOCKED — NO DATA** | Prod `supplier_payout_periods` / earnings = 0 |

Screenshots: `scripts/p925-screenshots/B-payouts-populated-*.png`, `B-documents-populated-*.png`, `B-overview-last-completed.png`.

## Tests / build

- `supplier-income-p925.cert.test.ts` (+ fixture shape asserts)  
- Related income/money certs  
- `tsc` target + `npm run build`

## Remaining blockers

1. **Production populated-history: BLOCKED — NO DATA** — wait for real supplier activity; do not invent production periods.
2. Pagination of many payout periods not exercised (only 2 fixture rows).

## Next

Stop. Do not seed production.
