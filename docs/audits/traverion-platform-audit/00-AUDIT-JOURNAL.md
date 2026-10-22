# Traverion Platform Audit — Running Journal

**Audit start:** 2026-10-22  
**Mode:** AUDIT ONLY (documentation under `docs/audits/traverion-platform-audit/`)  
**Repo:** `/Users/mirovesterinen/Documents/traverion.com` @ `main`

## Method

- Code inspection of App routing, pages, edge functions, migrations, tests
- Parallel specialist inventory (routes, bookings/payments, supplier/admin/security, consumer)
- Non-destructive local checks: selective vitest, eslint on App.tsx, existing prior docs treated as UNVERIFIED until re-proven
- Browser smoke limited to local Vite homepage (consumer explore); partner/admin/Stripe TEST E2E **NOT VERIFIED** in this session
- No schema changes, no deploys, no production writes, no real charges

## Phase checklist

| Phase | Topic | Status |
|------:|-------|--------|
| 01 | Repository & architecture | Done |
| 02 | Route & feature inventory | Done |
| 03–06 | Consumer surfaces | Done (code + limited browser) |
| 07–12 | Supplier surfaces | Done (code) |
| 13 | Admin | Done (code) |
| 14–17 | Bookings/payments/security/infra | Done (code + selective tests) |
| 18–19 | Perf/UX/E2E certification | Partial — metrics & full E2E NOT VERIFIED (documented) |
| 20 | Deliverables | Done — 01–12 written |
| Sprint 01 | Launch certification (payments/inventory) | Done — doc 13; contract PASS 103; E2E BLOCKED for founder |

## Key evidence anchors

- Architecture: Vite React SPA + Supabase Auth/Postgres/Edge + Stripe Checkout (TEST-gated)
- Routes: client page keys in `src/App.tsx` / `src/lib/appRouting.ts` (no React Router)
- Edge functions: 16 under `supabase/functions/`
- Migrations: 262 SQL files
- Unit/contract tests: ~589 `*.test.ts(x)` files
- Crons: GitHub Actions for booking reminders + expire stay R2B (not Vercel crons)
- Prior founder readiness (2026-10-05): useful but labeled **UNVERIFIED** for this audit’s runtime claims

## Notable findings during execution

1. Cart soft-retired: `/cart` URL still renders hold UI; `navigate('cart')` → Trips
2. Stay R2B is fully coded (authorize → accept/capture), not stubs; runtime NOT VERIFIED
3. Traveler cancel marks Refund due; **does not** auto Stripe-refund (by design)
4. Instant Book unpaid pending does **not** occupy inventory (mig 257)
5. Team invites UI = Coming Soon; memberships preserved
6. Analytics = stub (`src/lib/analytics.ts`)
7. Selective vitest: `commercial-money-engine-v1.test.ts` **FAILED** (UI copy expectation “Eligible for next payout”) — treat Money UI contract as drift risk
8. Homepage destination covers now prefer listing photos (Finland/Rovaniemi) — verified earlier in session on local Vite
