# 15 — Final Stripe LIVE Production Certification

**Date:** 2026-10-30  
**Commit at report:** `71828995` (+ this certification pack)  
**Mode:** Audit + contract verification only  
**Non-negotiables honored:** No LIVE activation · No credential changes · No removal of LIVE safety blocks · No commission/payout policy changes · No Instant Book / R2B semantic rewrites

---

## Final verdict

# CONDITIONAL GO — Specific prerequisites remain

**Technically:** Tours / Stays Instant Book / Stay R2B / Rentals payment capture and inventory promote paths are mature under Stripe **TEST**, with atomic paid promotion, webhook idempotency, env ownership guards, and (for tour/stay) auto-refund execution. Prior Stripe TEST concurrency races for tour last-seat and stay same-night **PASS**ed with one winner + loser refunded.

**Not ready to flip LIVE yet** because:

1. LIVE keys are still hard-blocked by design (correct until founder unlock).
2. Stripe Connect is **not enabled** on the platform TEST account (cert blocked); LIVE Connect payouts have no enablement path and no `transfers.createReversal` after refund.
3. Supplier cash-out today is **manual admin mark-paid** (or TEST-only SCAT). LIVE automated payouts are a separate program.
4. Several founder/ops items remain: LIVE Dashboard business verification, LIVE webhook endpoints + secrets, mailbox delivery proof, legal MoR / PSD2 decisions, and a controlled first LIVE transaction.

Once prerequisites below are completed **and** founder explicitly authorizes guard lift, architecture supports a controlled LIVE activation runbook (prepared, not executed).

---

## A. Certification results

Legend: **PASS** = verified with evidence this mission or archived runtime report · **FAIL** = confirmed defect · **BLOCKED** = cannot verify yet · **NOT TESTED** = no evidence this mission

### Subsystems

| Subsystem | Result | Evidence |
|-----------|--------|----------|
| LIVE safety blocks intact | **PASS** | Vitest `stripe-live-production-certification.cert.test.ts` (7) + sprint-01 T10; all money edges refuse non-`sk_test_` |
| Local env is TEST-only | **PASS** | `.env` / `.env.local`: `pk_test_` / `sk_test_`; no `pk_live_` / `sk_live_` present |
| Platform Checkout charge model | **PASS** (code) | Checkout `mode: payment` on platform; no `transfer_data` / `application_fee_amount` / `on_behalf_of` |
| Webhook idempotency / replay | **PASS** (contracts) | `stripe-webhook-replay`, `stay-webhook-idempotency.cert` |
| Env ownership isolation | **PASS** (contracts) | `stripe-environment-guard` + webhook ownership decision |
| Tour Instant Book inventory (no unpaid hold) | **PASS** (contracts) | mig 257 + booking-hold + launch cert |
| Stay Instant Book inventory (no unpaid hold) | **PASS** (contracts) | same |
| Rental Instant Book inventory (no unpaid hold) | **PASS** (contracts) | mig 294 + `rental-instant-book-no-hold.cert` |
| Tour last-seat Stripe race | **PASS** (archived runtime) | `scripts/.cert-tour-stripe-race-report.json` verdict PASS (2026-10-22) |
| Stay same-night Stripe race | **PASS** (archived runtime) | `scripts/.cert-stay-stripe-race-report.json` verdict PASS (2026-10-22) |
| Stay R2B authorize/capture/decline/expire | **PASS** (contracts) · **NOT TESTED** (fresh runtime this mission) | stay-booking-request-action + expire edge + GH workflow |
| Tour/Stay auto-refund on cancel | **PASS** (contracts) | mig 264/267 + `execute-booking-refund` + cert tests |
| Rental auto-refund | **NOT TESTED** / policy | No automatic rental refunds (`rental-cancellation`); ops/manual |
| Rental Stripe journey (TEST) | **PASS** (archived) | `scripts/cert-rental-stripe-journey.report.json` ok:true (2026-10-25); production rental checkout flag previously activated under TEST |
| Connect onboarding E2E | **BLOCKED** | `cert-connect-scat-test.report.json`: Connect not enabled on platform TEST account |
| Connect SCAT LIVE | **BLOCKED** | TEST-only multi kill-switch; no LIVE mode in code |
| Transfer reversal on refund | **FAIL** (gap) | Architecture requires `transfers.createReversal`; **not implemented** in refund/transfer edges (cert lock asserts absence) |
| Customer/supplier emails mailbox | **NOT TESTED** this mission | Notify edges exist; inbox proof founder |
| Production Supabase advisors via MCP | **BLOCKED** | MCP lists unrelated project only; linked prod ref `xcopqllkulxfkpunetbc` not in MCP org |
| Stripe Dashboard LIVE business / bank | **BLOCKED** | Manual Dashboard; not inspected |
| LIVE webhook endpoint configured | **BLOCKED** | Requires Dashboard + Supabase secret set (not done; must not guess) |
| Commission % correctness | **PASS** (code) · **NOT TESTED** (LIVE money) | `commercial-money` + freeze + `record_paid_booking_earnings`; rates unchanged |
| Gross vs net presentation | **PASS** (code) | Traveler/supplier emails gross; Income/Analytics expose net appropriately |
| Performance / checkout redirect | **PASS** (contracts prior) | Stay/rental checkout speed certs exist; no new polling introduced this mission |

### Category matrix (Phase 8)

| Scenario | Tours | Stays | Rentals |
|----------|-------|-------|---------|
| Successful payment | PASS contracts + prior race promote | PASS contracts + prior race | PASS archived journey |
| Failed payment | PASS contracts | PASS contracts | PASS contracts |
| Cancelled checkout | PASS contracts | PASS contracts | PASS contracts (expire/release) |
| Duplicate webhook | PASS contracts | PASS contracts | PASS contracts |
| Last available inventory | **PASS runtime** (2026-10-22) | **PASS runtime** (2026-10-22) | PASS contracts / partial journey |
| Concurrent customers | **PASS runtime** | **PASS runtime** | NOT TESTED fresh dual-payer race |
| Refresh / redirect recovery | PASS contracts (reconcile) | PASS contracts | PASS contracts |
| Supplier cancellation | PASS contracts (auto-refund queue) | PASS contracts | NOT TESTED (manual refund policy) |
| Refund correctness | PASS contracts (+ webhook truth) | PASS contracts | NOT TESTED auto path |
| Customer confirmation | NOT TESTED mailbox | NOT TESTED mailbox | NOT TESTED mailbox |
| Supplier notification | NOT TESTED mailbox | NOT TESTED mailbox | NOT TESTED mailbox |
| Commission reconciliation | PASS ledger contracts | PASS ledger contracts | PASS freeze-required path |
| Stay R2B auth/capture | — | PASS contracts · runtime NOT TESTED this mission | — |
| Rental pickup/return transitions | — | — | PASS contracts / prior certs · fresh NOT TESTED |

**This mission executed:** 100 prior cert tests + 7 new LIVE certification locks — all green. **Did not** create LIVE charges, destroy customer data, or write new bookings on shared production.

---

## B. Launch blockers

### P0 — blocks live launch

| ID | Issue | Notes |
|----|-------|-------|
| **P0-1** | LIVE Stripe unlock not authorized | Intentional `stripe-test-only` on all money edges + client publishable gate. Must remain until founder unlock. |
| **P0-2** | LIVE credentials + webhooks not provisioned | Need LIVE `pk`/`sk`, LIVE `STRIPE_WEBHOOK_SECRET`, Dashboard endpoint → production Supabase function URL. Staging must not share LIVE endpoint fan-out. |
| **P0-3** | Stripe Connect not enabled on platform (TEST cert) | Blocks Connect onboarding/SCAT proof; LIVE Connect blocked a fortiori. Manual payouts can bridge short-term. |
| **P0-4** | No post-transfer refund reversal | If LIVE SCAT enabled without `createReversal`, refunds after supplier transfer create platform shortfall risk. **Do not enable LIVE transfers until fixed or transfers stay off.** |
| **P0-5** | Legal / MoR / fund-holding decisions | Outstanding founder/counsel items (PSD2, who is MoR, Connect controller/liability). |

### P1 — must resolve before scaling

| ID | Issue |
|----|-------|
| **P1-1** | Supplier LIVE payouts: either keep manual `admin_mark_payout_period_paid` with SLA, or finish Connect LIVE program |
| **P1-2** | Mailbox delivery proof (customer + supplier) for paid/cancel/refund |
| **P1-3** | Fresh Stay R2B accept/decline/expire drill on Stripe TEST before marketing Request-to-Book widely |
| **P1-4** | Rental dual-customer last-unit race runtime re-cert |
| **P1-5** | Vercel project stores `STRIPE_SECRET_KEY` (flagged `readable-secret`) while frontend never reads it — remove after confirm no serverless consumer |
| **P1-6** | Card-only Checkout (`payment_method_types: ['card']`) — blocks dynamic wallets; product decision before EU scale |
| **P1-7** | `inventory_conflict_refund_failed` transient events observed in race reports (later refunded) — improve ops alerting |

### P2 — after launch

| ID | Issue |
|----|-------|
| **P2-1** | Dynamic payment methods (omit `payment_method_types` per Stripe guidance) |
| **P2-2** | Notify/earnings failures retry via webhook throw — consider async notify queue |
| **P2-3** | Separate Stripe sandboxes for local/CI vs shared TEST account |
| **P2-4** | Rental auto-refund parity with tour/stay (policy change — needs authorization) |

---

## C. Required fixes

| Issue | Root cause | Files | Safest solution | Done this mission? |
|-------|------------|-------|-----------------|--------------------|
| Overstated Connect refund-after-transfer readiness | Cert/report claimed code verification; `createReversal` absent | `execute-booking-refund`, `execute-supplier-transfers`, docs architecture §8 | Keep transfers TEST-only until reversal implemented; lock gap in cert test | **Yes** — cert lock added |
| Stale launch-blocker “no auto refund” | Tours/stays now queue + execute Stripe refunds | mig 264/267, `execute-booking-refund` | Update launch docs | **Yes** — see § updates below |
| Accidental LIVE enable | Founder pressure | `stripe-test-only.ts` | Keep blocks; use runbook | **Yes** — blocks untouched |
| Vercel Stripe secret | Secret placed on frontend project | Vercel env | Manual remove after audit | **No** (needs human Dashboard confirm) |
| Connect not enabled | Stripe account setting | Dashboard | Enable Connect on TEST then LIVE | **No** (Dashboard) |

**No payment policy, credential, or LIVE-guard code changes were made.**

---

## D. LIVE activation runbook (prepare only — do not execute)

### 0. Preconditions (all must be true)

- [ ] Founder written authorization for LIVE payments
- [ ] Counsel sign-off on MoR / Connect / terms
- [ ] Stripe LIVE account business verification complete (Dashboard)
- [ ] Decision: **manual payouts first** OR Connect LIVE with transfer-reversal shipped
- [ ] If Connect LIVE: implement `transfers.createReversal` + recovery tests first
- [ ] Staging uses separate Stripe account **or** ownership metadata proven with ignore probes
- [ ] DB backup / point-in-time restore verified
- [ ] On-call + Stripe Dashboard access confirmed

### 1. Pre-launch backups and checks

1. Snapshot production DB (Supabase PITR / backup).
2. Tag git SHA for rollback.
3. Record current Edge Function deploy versions.
4. Confirm `RENTAL_CHECKOUT_ENABLED` desired state.
5. Confirm TEST disclosures still show while TEST keys remain.
6. Run:  
   `npx vitest run src/lib/stripe-live-production-certification.cert.test.ts src/lib/launch-certification-sprint-01.cert.test.ts`

### 2. Stripe LIVE configuration (Dashboard — manual)

1. Create / verify LIVE API keys (`pk_live_…`, `sk_live_…`) — store only in Supabase Edge secrets + Vercel **publishable** only.
2. **Never** put LIVE secret on Vercel frontend project.
3. Configure LIVE payment methods in Dashboard (prefer dynamic methods; align code if omitting `payment_method_types`).
4. Confirm currencies / business country / payout schedule.

### 3. Webhook setup and verification

1. Add LIVE endpoint: `https://<prod-ref>.supabase.co/functions/v1/stripe-webhook`.
2. Subscribe: `checkout.session.completed`, `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.*`, plus Connect events if using Connect.
3. Set Supabase secret `STRIPE_WEBHOOK_SECRET` to LIVE signing secret.
4. Smoke: send test event; confirm `stripe_webhook_events` row; foreign project ref ignored.

### 4. Connect readiness

**Path A — Manual payouts (recommended first LIVE week):**  
Leave `STRIPE_CONNECT_TRANSFERS_ENABLED` unset / not `live`. Pay suppliers via admin mark-paid.

**Path B — Connect LIVE (only after P0-4 fixed):**  
Enable Connect on LIVE account → onboard pilot suppliers → set explicit LIVE transfer flag (code change required; does not exist today) → liquidity checks → pilot one period.

### 5. Production deployment

1. Deploy app build with LIVE **publishable** key in Vercel Production.
2. Set Supabase Edge `STRIPE_SECRET_KEY=sk_live_…` **only after** code guard lift PR is merged (separate authorized change).
3. Deploy Edge Functions matching tagged SHA.
4. Keep TEST indicators gated on `appStripeIsTestMode()` — LIVE key clears them automatically.

### 6. Controlled first live transaction

1. Use a Traverion-owned card on a low-value pilot listing (tour preferred).
2. Complete Checkout → confirmation → My bookings Paid.
3. Verify webhook promote, earnings snapshot, customer + supplier email.
4. Cancel within policy → confirm refund instruction → Stripe refund → `charge.refunded` → ledger reverse.
5. Repeat one Stay Instant Book night and one Rental unit if rentals remain enabled.

### 7. Booking and payout reconciliation

1. Compare Stripe Dashboard charge vs `bookings.amount_paid` vs commercial snapshot.
2. Confirm no duplicate `supplier_earning_items` for booking.
3. If manual payouts: prepare first READY period export; mark paid with bank reference.

### 8. Monitoring (first 72h)

- `stripe_webhook_events` failures / ignored foreign
- `inventory_conflict_*` and `needsIntervention`
- Refund instruction backlog (`list_pending_cancel_refund_instructions`)
- Notify failure rates
- Platform Stripe balance vs reserved transfer liquidity (if Connect)

### 9. Rollback / payment-disable

1. **Immediate:** restore Edge `STRIPE_SECRET_KEY` to `sk_test_` **or** re-deploy build with LIVE guards (preferred: re-enable `isStripeTestSecretKey` gate).
2. Unset Vercel LIVE publishable → redeploy (forces client refuse).
3. Do **not** disable webhook endpoints as primary rollback (orphans charges).
4. For rentals only: `supabase secrets unset RENTAL_CHECKOUT_ENABLED`.
5. Manually reconcile any in-flight LIVE PaymentIntents in Dashboard.
6. Communicate pause to suppliers/customers.

---

## E. Architecture map (evidence)

```text
Traveler → create-booking-checkout-session (platform Checkout)
        → Stripe payment (automatic OR stay R2B manual capture)
        → stripe-webhook / reconcile-checkout-session
        → promotePaidFromCheckoutSession
        → promote_paid_checkout_booking | confirm_rental_checkout_paid
        → record_paid_booking_earnings + notify-*

Supplier money: internal ledger → (TEST) execute-supplier-transfers SCAT
                              → (prod today) admin_mark_payout_period_paid
```

**Instant Book (all categories):** unpaid pending does **not** occupy inventory; first successful paid promote wins; losers auto-refunded in promote path.  
**Stay R2B:** authorization occupies nights until accept/decline/expire.

---

## Evidence executed this mission

```bash
npx vitest run \
  src/lib/launch-certification-sprint-01.cert.test.ts \
  src/lib/launch-certification-sprint-02.secrets.cert.test.ts \
  src/lib/stripe-test-only.test.ts \
  src/lib/stripe-environment-guard.test.ts \
  src/lib/stripe-webhook-replay.test.ts \
  src/lib/booking-concurrency-safety.cert.test.ts \
  src/lib/checkout-inventory-concurrency.cert.test.ts \
  src/lib/stay-checkout-concurrency.cert.test.ts \
  src/lib/stay-instant-book-no-hold.cert.test.ts \
  src/lib/stay-webhook-idempotency.cert.test.ts \
  src/lib/rental-instant-book-no-hold.cert.test.ts \
  src/lib/tour-auto-refund.cert.test.ts \
  src/lib/stay-auto-refund.cert.test.ts \
  src/lib/connect-payout-mission2.cert.test.ts \
  src/lib/connect-payout-foundation.cert.test.ts \
  src/lib/multi-departure-inventory.cert.test.ts \
  src/lib/stripe-live-production-certification.cert.test.ts
```

**Result:** 17 files / 107 tests passed (100 + 7).

Env probe (prefixes only): local `pk_test_` / `sk_test_`; Vercel has `VITE_STRIPE_PUBLISHABLE_KEY` + unexpected `STRIPE_SECRET_KEY` (values not decrypted).

---

## Production launch checklist (Phase 9 summary)

| Item | Owner | Status |
|------|-------|--------|
| Stripe account LIVE verification | Founder / Dashboard | Outstanding |
| LIVE pk + sk in correct stores | Founder + eng | Outstanding |
| LIVE webhook + signing secret | Founder + eng | Outstanding |
| Connect enablement | Dashboard | Outstanding (TEST blocked) |
| Supplier payout path chosen | Founder | Outstanding |
| Env separation (accounts or ownership guard) | Eng | Guard code PASS; separate LIVE account recommended |
| Migrations | Eng | Rental 291 applied historically; no new mig this mission |
| Deploy + guard-lift PR | Eng (authorized) | Not started |
| Rollback procedure | This runbook §9 | Prepared |
| Monitoring | Ops | Prepared |
| Legal / tax / MoR | Founder + counsel | Outstanding |

---

## Safe changes shipped with this certification

1. `src/lib/stripe-live-production-certification.cert.test.ts` — locks LIVE blocks, SCAT TEST-only, platform charge model, and documents missing `createReversal`.
2. This report: `docs/audits/traverion-platform-audit/15-STRIPE-LIVE-PRODUCTION-CERTIFICATION.md`
3. Refresh of outdated auto-refund note in `09-LAUNCH-BLOCKERS.md`
