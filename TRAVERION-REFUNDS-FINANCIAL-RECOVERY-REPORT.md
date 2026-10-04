# TRAVERION — REFUNDS & FINANCIAL RECOVERY REPORT

## 1. EXECUTIVE VERDICT

**SAFE FOR TEST SUPPLIER FLOW**

Refunds, cancellations, READY-period adjustments, post-PAID recovery accounting, financial holds, dispute representation, and 48h eligibility hold are implemented and adversarially verified in Stripe TEST / linked DB. Automatic Stripe refund execution and bank payouts remain intentionally off. Chargeback **economic liability** is represented (holds + recovery) but not legally assigned.

## 2. STARTING SHA

`f98fd41977f2e0944b555645a6bdea5deb376816`

## 3. ENDING SHA

See git HEAD after commits below.

## 4. COMMITS

- Refunds & financial recovery engine (migration 241 + webhook disputes + admin investigation + UI + tests)
- Report SHA commit

## 5. PUSH / DEPLOY STATE

| Layer | State |
|-------|--------|
| Git push | **Not pushed** (local ahead) |
| `supabase db push` | Migration **241** applied |
| Edge | `stripe-webhook`, `admin-supplier-verification` deployed |
| Stripe | **TEST only** |

## 6. FINANCIAL STATE MACHINE

| Concept | Representation |
|---------|----------------|
| Booking ops | `bookings.status` pending/confirmed/cancelled |
| Payment provider | `bookings.payment_status` pending/paid/failed/refunded |
| Refund owed (not paid out by Stripe) | cancelled + paid + `refund_choice ≠ no_refund` → UI **Refund due** |
| Refund succeeded | `payment_status = refunded` (full) or shrunk `amount_paid` (partial) |
| Commercial economics | `booking_commercial_snapshots` original + remaining_* minors |
| Supplier lifecycle | `supplier_earning_items` pending→eligible→included→paid / reversed |
| Payout prep | `supplier_payout_periods` ready/paid/cancelled (no bank transfer) |
| Post-payout recovery | ledger `supplier_recovery` (negative) + hold `negative_balance` |
| Dispute | `bookings.dispute_*` + `booking_dispute_events` (≠ refund) |
| Financial hold | `booking_financial_holds` (blocks eligibility / prep) |
| Refund instruction | `booking_refund_instructions` status ready (no Stripe call) |
| Audit | `financial_audit_log` |

## 7. TRAVELER CANCELLATION

Unchanged server policy: SECURITY DEFINER `cancel_booking_as_traveler` with **24h free-cancel window** (SQL), not listing free-text. Preview helpers in `cancellation-policy.ts`. UI must show Refund due ≠ Refunded (`payment-states.ts` + `REFUND_DUE_MANUAL_COPY`).

## 8. SUPPLIER CANCELLATION

Host request → traveler accept still posts full_refund entitlement + optional €20 penalty. Does not Stripe-refund. Inventory frees on cancel. Earnings reverse via ledger refund + commercial trigger (now also unlinks READY).

**OWNER POLICY:** traveler entitlement on supplier cancel remains “full refund expectation” in product; legal terms still owner-owned.

## 9. ADMIN CANCELLATION

Investigation tool (Admin → Commercial): hold set/release (reason+note+actor audit), prepare refund instruction (confirm, reason, idempotent, **no Stripe**), full booking reconstruction RPC.

## 10. FULL REFUND

€1,000 STANDARD → remaining 0/0/0; ledger refund + commission adjustment; earning reversed; READY unlinked.  
€1,000 FAST → same with 180/820 original. Duplicate reverse idempotent via `(kind, source_id)`.

## 11. PARTIAL REFUND

€1,000 STANDARD − €200 → remaining gross 800 / commission 120 / supplier 680. Proven Vitest + `shrink_paid_booking_earnings`.

## 12. MULTIPLE REFUNDS

Sequential refunds recompute from original − cumulative (no drift). Vitest: 100+200+50 vs single 350.

## 13. REFUND BEFORE PAYOUT

Pending/eligible shrink or reverse → never incorrectly payable; blocked if cancelled.

## 14. REFUND DURING PAYOUT PREP

`commercial_unlink_earning_from_unpaid_periods` + shrink updates `supplier_payout_period_items` / period totals under READY. Unique `earning_item_id` prevents double inclusion.

## 15. REFUND AFTER READY

Adversarial fixture: READY item 68000 → shrink to 700 remaining → item/period **59500**. Period not left stale.

## 16. REFUND AFTER PAID (critical)

Fixture lifecycle (STANDARD €1,000):

1. Settle → supplier 85000 / commission 15000  
2. Shrink to €800 → supplier 68000  
3. Include in READY → mark **paid** (historical period retained)  
4. Shrink to €700 while READY → 59500 (before mark in fixture order: shrink READY then mark, then shrink after paid to €500)  
5. After PAID shrink to €500 remaining → supplier remaining **42500**  
6. `supplier_recovery` ≥ **€170** (59500−42500)  
7. Active `negative_balance` hold  
8. Paid period status remains **paid** (not erased)  
9. Cancel + refresh eligibility → **not** eligible

## 17. SUPPLIER NEGATIVE / RECOVERY ACCOUNTING

- Ledger kind `supplier_recovery` (negative amount)  
- Auto hold `negative_balance`  
- Supplier Money UI warns on recovery balance  
- **No negative bank transfer**  
- Future netting against new earnings = **OWNER POLICY** (architecture ready; not auto-settled)

## 18. PAYMENT DISPUTES / CHARGEBACKS

Webhook: `charge.dispute.created|updated|closed|funds_withdrawn|funds_reinstated` → `apply_booking_dispute_event`.  
Open/lost → chargeback hold + unlink READY. Won/closed → release hold. Lost after paid → recovery representation.  
**Liability assignment = OWNER POLICY.**

## 19. STRIPE EVENT MATRIX

| Event | Handler |
|-------|---------|
| checkout.session.completed | promote paid |
| payment_intent.succeeded | promote |
| payment_intent.payment_failed | fail unpaid |
| checkout.session.expired | expire hold |
| charge.refunded | partial shrink / full reverse |
| charge.dispute.* | dispute RPC + hold |
| other | ignored |

Idempotency: processed events table + ledger unique keys + dispute `stripe_event_id` unique + refund instruction idempotency key.

## 20. RECONCILIATION

Admin investigation RPC compares booking/snapshot/ledger/holds/disputes/refund instructions/period. Manual Stripe Dashboard remains authority for cash movement. No silent auto-correct of dangerous mismatches.

## 21. INVENTORY

Cancel frees occupancy immediately (`booking_occupies_inventory`). Partial refund keeps paid confirmed → inventory held. Full refunded releases.

## 22. RESCHEDULE

`refund_choice=reschedule` exists but **no money-safe reschedule product**. Price-changing reschedule not supported — do not fake it.

## 23. NO-SHOW / EXCEPTION STATES

No dedicated no-show refund automation. Holds + cancelled/dispute block eligibility. Weather/supplier-fail legal refund % = OWNER POLICY.

## 24. 48-HOUR HOLD

`payout_hold_hours = **48**` (OWNER DECISION applied). Eligibility = experience_at + 48h, then still waits for STANDARD/FAST cycle. Cancelled/disputed/held never promote.

## 25. MONTHLY PAYOUT BOUNDARY

UTC calendar. Eligible Oct 22 → Nov 1. Eligible Nov 2 → Dec 1. Eligible Nov 1 → Nov 1.

## 26. FAST PAYOUT BOUNDARY

UTC. Eligible Oct 13 → Oct 15. Eligible Oct 16 → Nov 1. Eligible Nov 1 → Nov 1.

## 27. TIMEZONE MODEL

- Experience: `purchase_snapshot.departureTimezone` else `Europe/Helsinki`  
- Payout run days / prepare cutoff: **UTC**  
- Cancel window: existing purchase/listing TZ logic (unchanged)

## 28. SUPPLIER UI

Income: pending/eligible/prep/paid + recovery callout. Ledger label for `supplier_recovery`. Plan still authoritative from DB.

## 29. TRAVELER UI

Labels: Refunded only when `payment_status=refunded`; Refund due otherwise; Payment disputed / Chargeback lost when dispute open/lost.

## 30. ADMIN INVESTIGATION UI

Admin → Commercial → Booking financial investigation (holds, prepare refund, snapshot/ledger/recovery).

## 31. NOTIFICATIONS

Existing soft-notify refund_completed / partial_refund_recorded / cancel paths retained. Dispute emails not newly claimed as delivered.

## 32. SECURITY

- Hold/prepare/investigation RPCs: **service_role only** via admin edge assertAdmin  
- Suppliers cannot write holds/recovery/terms  
- Client amounts not trusted for refund prepare without server remaining-gross checks  
- Traveler cancel still SECURITY DEFINER with coerced refund choice

## 33. IDEMPOTENCY

Duplicate reverse, duplicate dispute event id, duplicate prepare_refund key, duplicate shrink to same remaining — safe.

## 34. CONCURRENCY

READY unlink + period recompute; paid period immutable; recovery append-only; prepare unique constraints.

## 35. TEST RESULTS

- `financial-recovery.test.ts` 8/8  
- `financial-recovery-engine.test.ts` 4/4  
- `commercial-money.test.ts` 12/12  
- Remote adversarial SQL lifecycle: **OK**

## 36. ADVERSARIAL TEST RESULTS

Attempted: multi-shrink, READY stale amount, erase paid period, cancelled→eligible by time, missing recovery/hold. All blocked/correct in fixture.

## 37. OWNER POLICY DECISIONS STILL REQUIRED

1. Chargeback / post-payout refund **liability** (supplier vs platform)  
2. Auto-net recovery against future earnings  
3. Supplier-cancel legal refund guarantee text  
4. No-show refund rules  
5. VAT  
6. Whether to automate Stripe refund execution (TEST worker)  
7. EUR-only payout execution

## 38. REAL-MONEY BLOCKERS

- No LIVE Stripe  
- No automatic bank payout  
- No automatic Stripe refund execution  
- Liability policy unfinished  
- Reschedule money product unfinished

## 39. NEXT MISSION

Recommend **D. founder end-to-end TEST** (pay → cancel/refund due → Stripe TEST refund → Money UI → READY → mark paid → post-paid partial → recovery visible), then **C. Stripe refund execution automation (TEST)** or **B. payout execution/provider**.

## 40. FINAL ANSWER

**YES**

Lifecycle numbers (STANDARD €1,000 adversarial fixture):

| Step | Remaining gross | Commission | Supplier | Notes |
|------|----------------:|-----------:|---------:|-------|
| Paid | 1000 | 150 | 850 | snapshot + earning |
| Partial −200 | 800 | 120 | 680 | eligible/READY path |
| READY adjust −100 | 700 | 105 | 595 | period item updated |
| Mark paid | 700 | 105 | 595 | historical PAID kept |
| Post-paid −200 | 500 | 75 | 425 | `supplier_recovery` €170 + hold |

Traverion can reconstruct every step; silent loss of READY/PAID truth is prevented; recovery is explicit.

---

**Verdict reminder:** SAFE FOR TEST SUPPLIER FLOW — not a claim of LIVE production legal completeness.
