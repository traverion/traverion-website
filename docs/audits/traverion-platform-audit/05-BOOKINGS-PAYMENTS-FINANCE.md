# 05 — Bookings, Payments & Finance

**Runtime:** NOT VERIFIED end-to-end in this audit. Classifications are **code-evidence**.  
**Stripe:** TEST-only enforcement in payment edges (LIVE secret → 503).

---

## Authoritative sources of truth

| Concern | Authority |
|---------|-----------|
| Price / quote | Edge `quoteListingBooking` / stay quote; client totals ignored |
| Inventory occupy | SQL `booking_occupies_inventory` (mig 257) + TS mirrors |
| Unpaid Instant Book row | `bookings` pending — **does not occupy** |
| Paid Instant Book | RPC `promote_paid_checkout_booking` |
| R2B authorize | `promote_authorized_checkout_booking` → `authorized` + occupy |
| R2B accept | claim → Stripe capture → `capture_stay_booking_request` |
| R2B release/expire | `release_stay_booking_request` / `expire_stay_booking_requests` |
| Traveler cancel | `cancel_booking_as_traveler` (+ refund_choice); no auto Stripe refund |
| Earnings | `record_paid_booking_earnings` → ledger |
| Refund money movement | Stripe `charge.refunded` webhook + orphan promote auto-refunds; prepared instructions for ops |
| Webhook idempotency | `stripe_webhook_events` insert-first |

---

## Tour Instant Book lifecycle (actual order)

1. Auth + verified email + consent  
2. Listing published + season checks; anti self-book  
3. Expire stale holds; server re-quote  
4. Capacity (paid+authorized only) + cutoff  
5. Claim/resume pending checkout booking  
6. Stripe Checkout `mode=payment`, auto-capture, **60 min** expiry  
7. Freeze commercial terms (non-fatal if fails)  
8. Webhook and/or `reconcile-checkout-session` → `promotePaidFromCheckoutSession`  
9. Atomic promote RPC; on conflict/underpay → **auto refund**  
10. Record earnings + notify  

**Status:** IMPLEMENTED/UNVERIFIED (COMPLETE as code path)

---

## Stay Instant Book lifecycle

Same pipeline with stay nights occupancy, blocked nights, checkout date required.  
Pending Instant Book **does not** hold nights (257). Concurrent opens allowed; first successful promote wins; losers refunded.

**Status:** IMPLEMENTED/UNVERIFIED

---

## Stay Request-to-Book lifecycle

| Step | Implementation |
|------|----------------|
| Guest checkout | `capture_method: manual`; authorize PI |
| Host pending | `approval_status=pending`; 24h approval window after authorize |
| Occupy while authorized | Yes |
| Accept | `stay-booking-request-action` claim → capture → finalize paid |
| Decline / withdraw | Release + PI cancel |
| Expire | Edge + GH Actions hourly workflow |
| Checkout session TTL | Still **60 minutes** to complete card auth (24h helper unused) |

**Status:** IMPLEMENTED/UNVERIFIED (not stubs)  
**Risk:** capture-succeeded / DB-finalize-lag (webhook recovery path exists)

---

## Cancellation & refunds

| Path | Behavior | Status |
|------|----------|--------|
| Traveler cancel unpaid | Expire checkout | IMPLEMENTED/UNVERIFIED |
| Traveler cancel paid | Cancel + refund_choice; **Refund due ≠ Stripe refund** | PARTIAL (ops) |
| Traveler cancel authorized R2B | Must withdraw (cancel rejected) | IMPLEMENTED/UNVERIFIED |
| Promote rejection | Auto Stripe refund | IMPLEMENTED/UNVERIFIED |
| `charge.refunded` | Update payment_status + reverse/shrink earnings | IMPLEMENTED/UNVERIFIED |
| Admin prepare refund instruction | `executes_stripe: false` | PARTIAL |
| Admin edge Stripe refund | Forbidden by tests | COMPLETE intentional |

---

## Finance / commercial

| Item | Status | Notes |
|------|--------|-------|
| Commercial terms freeze | IMPLEMENTED/UNVERIFIED | Non-fatal on create if missing |
| Ledger / earnings | IMPLEMENTED/UNVERIFIED | Mig 238 engine |
| Commission | PARTIAL | Historically 0% MoR — commercial decision pending |
| Payouts | PARTIAL | Manual record payout |
| Financial recovery engine | IMPLEMENTED/UNVERIFIED | Mig 241 |
| UI contract drift | PARTIAL | Vitest failure on earnings copy (2026-10-22) |

---

## Explicit risk investigations

| Risk | Finding |
|------|---------|
| Duplicate webhooks | Mitigated by `stripe_webhook_events`; reconcile uses synthetic id |
| Concurrent bookings | Designed: Instant pending non-occupying; R2B occupying; promote conflict refunds |
| Expired holds | `expire-booking-checkout` + stale expire on create |
| Paid but booking failed | Promote failure → auto refund paths; intervention flags if refund fails |
| Booking without payment | Should not promote without PI success gates |
| Failed payment consuming capacity | Instant pending does not occupy (257) |
| Duplicate earnings | Promote short-circuit + ledger helpers — certify in TEST |
| Refund not in reports | Manual refund path gap until charge.refunded |
| Cancelled but inventory blocked | Cancel RPCs should release; certify |
| R2B decline leaves active | Release RPC — certify |
| Expire job not running | Workflow file exists; **production GH secrets NOT VERIFIED** |
| Email provider failures | Soft-fail; booking remains source of truth |

---

## Critical path test matrix (for certification)

| ID | Path | Env | Pass criteria |
|----|------|-----|---------------|
| T1 | Tour Instant Book pay | Stripe TEST | Booking paid in Trips + supplier bookings + earnings row |
| T2 | Stay Instant Book pay | TEST | Nights blocked only after paid; confirmation honest |
| T3 | Two Instant Book same nights | TEST | One paid, other auto-refunded |
| T4 | Stay R2B authorize | TEST | Authorized occupy; host notified |
| T5 | R2B accept | TEST | Capture + paid + earnings |
| T6 | R2B decline | TEST | PI canceled; nights free |
| T7 | R2B expire | TEST | Cron/edge releases after window |
| T8 | Traveler cancel paid full_refund | TEST | Refund due; **manual** Stripe refund; webhook syncs ledger |
| T9 | Webhook replay | TEST | Second delivery no double earnings/email |
| T10 | LIVE key | Any | Edge returns 503 / blocked |

**This audit did not execute T1–T10 against Stripe.**
