# 10 — Development Roadmap

Ordered for **shortest safe path** to a reliable Tours+Stays marketplace. No Flights/Cars/Packages expansion.

---

## Phase A — Critical safety & integrity

| Task | Priority | Complexity | Deps | Key files / systems | Verification | Done when |
|------|----------|------------|------|---------------------|--------------|-----------|
| A1 Stripe TEST certification matrix T1–T10 | P0 | L | Stripe TEST keys | edge checkout/webhook/R2B | Recorded TEST Evidence | All critical paths pass |
| A2 Prove Resend mailbox delivery | P0 | M | Resend domain | notify-* | Inbox screenshots | Customer+supplier receive paid/cancel/message |
| A3 Confirm admin allowlist + wipe runbook | P0 | S | public.admin | AdminShell, admin edge | Negative auth tests | Unauthorized denied; wipe gated |
| A4 Fix earnings UI / commercial-money test drift | P1 | S | — | SupplierEarnings, commercial-money-engine-v1.test.ts | vitest green | Non-misleading payout copy |
| A5 Concurrent Instant Book race drill | P0 | M | A1 | mig 257, promote refunds | Two-session TEST | One winner, auto-refund loser |
| A6 R2B accept/decline/expire drill | P0 | M | A1, cron | stay-booking-request-action | Matrix T4–T7 | Consistent PI+DB+calendar |

---

## Phase B — Complete core marketplace workflows

| Task | Priority | Complexity | Deps | Systems | Verification | Done when |
|------|----------|------------|------|---------|--------------|-----------|
| B1 Supplier #1 golden path (signup→verify→publish→book) | P0 | L | A2, admin verify | Partner + admin | Scripted TEST | First supplier live on TEST |
| B2 Pickup/meeting-point ops certification | P1 | M | B1 | Pickup planner | Tour with meeting + pickup | Host sees every booking needing action |
| B3 Cancel + manual refund playbook + training | P1 | M | A1 | cancel RPC, Stripe Dashboard | Timed drill | SLA documented |
| B4 Optional: refund execute worker (idempotent) | P1 | L | B3, 241 | new edge + admin | TEST refunds | Refund due can be executed in-app safely |
| B5 Commission policy decision + ledger alignment | P0 commercial | M | Founder | commercial money | Policy doc + tests | LIVE model chosen |
| B6 Stay creator property-type / 1-night pricing regression | P1 | M | — | StayOnboardingFlow | Existing consistency tests + manual | No overwrite bugs |

---

## Phase C — Launch certification

| Task | Priority | Complexity | Deps | Verification | Done when |
|------|----------|------------|------|--------------|-----------|
| C1 Fill LAUNCH_CHECKLIST.md in production | P0 | M | A/B | Checklist [x] with dates | All P0 boxes checked |
| C2 GH Actions cron green in prod | P1 | S | secrets | Actions history | 7 days without silent fail |
| C3 Mobile Safari/Chrome traveler book | P1 | M | A1 | Device matrix | Tour+stay bookable |
| C4 Legal pages sign-off | P1 | S | counsel | Review | Published accurate |
| C5 Monitoring: error/email/webhook alerts | P1 | M | provider choice | Alert fires on TEST fault | On-call knows |
| C6 Support runbooks (traveler + supplier) | P1 | M | — | Docs | Support can resolve top 10 issues |

---

## Phase D — Quality & performance

| Task | Priority | Complexity | Notes |
|------|----------|------------|-------|
| D1 Lighthouse CWV measure + fix LCP/INP | P2 | M | Measure first |
| D2 A11y pass on browse/PDP/checkout | P2 | M | |
| D3 Remove/redirect cart confusion | P2 | S | Align cancelPath copy |
| D4 Delete or wire PartnerHelpPage orphan | P3 | S | |
| D5 Reduce supplier TS noise / typecheck gate | P2 | L | Don’t block ship on historical noise without plan |
| D6 Progressive disclosure for new suppliers | P3 | M | Dashboard simplification |

---

## Phase E — Growth & scaling

| Task | Priority | Complexity | Notes |
|------|----------|------------|-------|
| E1 Stripe Connect / automated payouts | P1 for scale | L | After commercial policy |
| E2 Product analytics (replace stub) | P2 | M | Funnel: search→PDP→pay |
| E3 SEO content beyond sitemap | P2 | M | Only if inventory quality high |
| E4 Team invites (finish Coming Soon) | P2 | M | |
| E5 Multi-unit stays (if demanded) | P2 | L | Don’t start until single-unit proven |
| E6 Supplier acquisition tooling | P2 | M | Onboarding conversion |
| E7 GDPR export/delete self-serve | P2 | M | Before EU scale marketing |

---

## Suggested sequence (exact order)

1. A1 → A5 → A6 (money/inventory truth)  
2. A2 → A3 → A4  
3. B1 → B2 → B3  
4. B5 (commercial decision) before any LIVE planning  
5. C1–C6  
6. B4 if manual refunds become bottleneck  
7. D* then E*  

**Definition of “commercially viable MVP”:** Phases A–C complete on Stripe TEST with one real supplier operating; LIVE is a subsequent gated program after B5 + Connect/payout decision.
