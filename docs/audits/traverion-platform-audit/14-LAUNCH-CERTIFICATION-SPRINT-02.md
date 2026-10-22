# 14 — Launch Certification Sprint 02

**Date:** 2026-10-22  
**Scope:** Autonomous E2E browser certification, webhook/inventory/notify/cron evidence, founder-action reduction  
**Mode:** Stripe **TEST only** — LIVE remains disabled  
**Continues:** Sprint 01 (`ead49b51`) / doc `13-LAUNCH-CERTIFICATION-SPRINT-01.md`  
**Shared Supabase project:** `xcopqllkulxfkpunetbc` (treated as production-like — **no booking writes**)

---

## Executive result

| Layer | Outcome |
|-------|---------|
| Environment readiness probe | **COMPLETE** (see below) |
| Contract / unit cert pack (Sprint 01 + Sprint 02 + deep-link) | **PASS** — 109 tests / 19 files |
| Browser E2E — consumer search → tour date/option → checkout auth wall | **PASS** (read-only path) |
| Browser E2E — Stripe TEST pay → paid booking → Trips/supplier | **FOUNDER ACCESS** (auth + TEST card) |
| Browser E2E — stay PDP + night calendar | **PASS** (after deep-link fix); pay/R2B still **FOUNDER ACCESS** |
| Stay deep-link bug (`/packages?tour=` → TourDetails) | **FIXED** + regression tests |
| Stripe webhook runtime + mailbox delivery | **FOUNDER ACCESS** / **NOT VERIFIED** |
| Cron: expire stay R2B | **PASS** (schedule + HTTP 200 evidence) |
| Cron: booking reminders | **PARTIAL** — workflow green but **all sampled schedule runs skip** (Finland hour gate + GHA delay) |
| LIVE payments | **Still disabled** (intentional) |
| Launch readiness verdict | **Still IMPLEMENTED / PARTIALLY VERIFIED** — tour selection E2E proven; payment+stay E2E not |

**No fake PASS.** Checkout was stopped at the login wall. No Stripe session created. No booking rows written by this agent.

---

## Phase 1 — Environment readiness

| Check | Result | Notes |
|-------|--------|-------|
| Stripe publishable (`pk_test_`) | Present in `.env` / `.env.local` | TEST |
| Stripe LIVE publishable (`pk_live_`) | Absent in probed local env | Safe |
| Local `STRIPE_SECRET_KEY` (`sk_test_`) | Present in `.env` only | **Not used** to create Checkout — would write to shared DB |
| Local `STRIPE_WEBHOOK_SECRET` | Absent | Cannot receive/sign webhooks locally |
| Edge Stripe secrets readable by agent | No | Correct — not fetched |
| Resend API key presence | Present locally | **Mailbox delivery NOT verified** |
| Supabase URL | `*.supabase.co` project `xcopqllkulxfkpunetbc` | Shared / production-like |
| Isolated test database | **No** | Blocks autonomous booking writes |
| Service role in local env | Absent | Email cert invoke blocked without founder env |
| Partner demo local file | Absent | No `partner-demo.local*` |
| Supplier / customer / admin test accounts | Not available to agent | No credentials in repo |
| Playwright (`@playwright/test`) | **Not installed** | Cursor IDE browser MCP used instead |
| GitHub Actions inspect | **Yes** (`gh` authenticated) | Cron history readable |
| Vite local app | Running (`127.0.0.1:5176`) | TEST MODE badge visible |

**Rule applied:** Creating Checkout sessions, pending bookings, or service-role notifies against the shared project is **UNSAFE** without an isolated staging DB + explicit founder-approved TEST accounts.

---

## Phase 2 — T1–T10 classification

| ID | Scenario | Classification | Precise reason |
|----|----------|----------------|----------------|
| **T1** | Tour Instant Book pay → paid + earnings | **FOUNDER ACCESS** | Browser reached login wall before Checkout; no traveler TEST credentials. Completing pay would write bookings on shared DB (also **UNSAFE** without staging). Contracts remain PASS from Sprint 01. |
| **T2** | Stay Instant Book — nights after pay | **FOUNDER ACCESS** (pay) · **AUTONOMOUS** (selection UI) | Stay listing exists (`listing_extras.inventoryFamily=stay`). Browser: StayDetails + check-in calendar PASS after deep-link fix. Checkout/pay still needs traveler auth + shared-DB caution. |
| **T3** | Two Instant Book same nights race | **UNSAFE** (runtime on shared DB) · contracts PASS | Would create competing bookings on production-like project. |
| **T4** | Stay R2B authorize + pending host | **FOUNDER ACCESS** | Needs listing with request method + traveler/supplier auth. Apartment calendar shows Instant-style Reserve UI. |
| **T5** | R2B accept → capture | **FOUNDER ACCESS** | Needs supplier auth + authorized TEST booking. |
| **T6** | R2B decline → PI cancel | **FOUNDER ACCESS** | Same. |
| **T7** | R2B expire via scheduled job | **AUTONOMOUS (infra)** · **FOUNDER ACCESS (seeded expire)** | Cron **PASS**: recent run HTTP 200 `{"success":true,"expiredCount":0}`. Expiring a real authorized request still needs a seeded TEST booking. |
| **T8** | Traveler cancel paid → Refund due + manual Stripe refund | **FOUNDER ACCESS** | Needs paid booking + Dashboard TEST refund. Honesty contracts PASS. |
| **T9** | Webhook replay — no double earnings | **FOUNDER ACCESS** | Needs Stripe Dashboard redeliver / edge `whsec`. Contracts PASS. |
| **T10** | LIVE key blocked | **AUTONOMOUS — PASS** | Sprint 01 unit + local `pk_test_` only; LIVE remains disabled. |

### Related autonomous classifications

| Path | Classification | Reason |
|------|----------------|--------|
| Homepage → Tours catalog → tour PDP | **AUTONOMOUS — PASS** | Browser |
| Tour date → availability → option → sticky CTA | **AUTONOMOUS — PASS** | Browser |
| Continue to checkout → auth wall | **AUTONOMOUS — PASS** | Login required; selection preserved; Google sign-in disabled (“Coming soon”) |
| Customer Trips / supplier bookings after pay | **FOUNDER ACCESS** | Auth |
| Notification mailbox proof | **FOUNDER ACCESS** | Resend dashboard / inbox |
| Duplicate webhook / capacity races at runtime | **UNSAFE** without isolated DB | Shared project |

---

## Phase 3 — Autonomous browser E2E evidence

**Tooling:** Cursor IDE browser MCP (Playwright not in package). Base: `http://127.0.0.1:5176`.

### Tour Instant Book path (read-only through auth)

| Step | Result | Evidence |
|------|--------|----------|
| 1. Consumer search / catalog | PASS | Homepage / Tours; published tour card |
| 2. Open tour PDP | PASS | `packages?tour=ddf096fb-2dea-4f59-965f-3cd31907cf03` — Northern Lights Guarantee |
| 3. Date selection | PASS | Calendar Oct 2026; selected **Friday 23 October** (`date=2026-10-23`) |
| 4. Check availability | PASS | Two options loaded (Standard Group 20:00; Small Group 18:30); “46 spots left this day” |
| 5. Select option + participants | PASS | Standard Group selected; URL includes `option=` + `mix=`; sticky shows €83.16, “47 spots left for the 20:00 departure”, test-mode copy |
| 6. Continue to checkout | PASS (auth wall) | Overlay: “Log in to continue to checkout. Your selection stays on this page.” Email/password + disabled Google |
| 7. Stripe TEST Checkout | **BLOCKED** | No traveler session — not attempted |
| 8–10. Paid booking / Trips / supplier / cancel | **BLOCKED** | Depends on step 7 |

Screenshot captured of login wall over selected tour sticky (agent session artifact; not committed).

### Stay path

| Step | Result | Evidence |
|------|--------|----------|
| Open stay via `/packages?tour=<stay-uuid>` (before fix) | **FAIL** | Rendered **TourDetails** + “Capacity unavailable” despite `listing_extras.inventoryFamily=stay` |
| Same URL after fix | **PASS** | Rewrites to `/stays?stay=e21b231b-…`; **StayDetails**; Stays nav current; €88/night; Check-in / Check-out |
| Night calendar | **PASS** | Oct 2026 calendar; check-in selectable (e.g. Fri 23 Oct); some nights unavailable |
| Stripe stay checkout | **BLOCKED** | Auth + no shared-DB write |

**Root cause (fixed):** `App.tsx` deep-link effect always set `tour-details` for `/packages?tour=`. Stays must resolve via `resolvePublicListingDeepLinkTarget` → `stay-details` + `/stays?stay=`.

---

## Phase 4 — Webhook and inventory certification

| Check | Result | Evidence |
|-------|--------|----------|
| Successful payment webhook processing | **NOT VERIFIED (runtime)** | Contracts PASS (Sprint 01); no TEST payment this sprint |
| Duplicate webhook idempotency | **PASS (contracts)** · **BLOCKED (runtime)** | `stripe-webhook-replay` + `stay-webhook-idempotency.cert` |
| Payment failure ≠ paid | **PASS (contracts)** | `payment-states` / admin booking ops |
| Concurrent tour capacity | **PASS (contracts)** · **UNSAFE (runtime on shared DB)** | `checkout-inventory-concurrency.cert` / `multi-departure-inventory.cert` |
| Concurrent stay reservation | **PASS (contracts)** · **ENVIRONMENT BLOCKED** | No stay listing |
| Expired availability holds | **PASS (contracts)** | `booking-hold` + `expire-booking-checkout` edge exists; **no GH workflow** for hold expiry (unlike R2B expire) |
| Booking state recovery | **PASS (contracts)** | `reconcile-checkout-session` / orphan refund helpers |
| Financial ledger consistency | **PASS (contracts)** | promote + earnings + money honesty (Sprint 01) |

---

## Phase 5 — Notification certification

| Trigger | Code path | Runtime / mailbox |
|---------|-----------|-------------------|
| Customer booking confirmation (`booking_confirmed_paid`) | Wired in `promote-paid-from-checkout` → `notify-customer-booking` | **NOT VERIFIED** |
| Supplier new booking | Idempotency keys in promote / supplier notify | **NOT VERIFIED** |
| R2B customer/supplier | Keys in promote + `stay-booking-request-action` | **NOT VERIFIED** |
| Accept / decline / expire | Edge functions + expire cron | Expire cron **reachable**; message delivery **NOT VERIFIED** |
| Cancellation | `notify-customer-booking` kinds present | **NOT VERIFIED** |
| Pickup updates | Implemented where coded | **NOT VERIFIED** |

**Discipline:** Provider API “accepted” ≠ mailbox PASS.  
**Harness:** `scripts/cert-transactional-emails.example.cjs` (env-only). Gitignored private runner stubbed to require `ALLOW_EMAIL_CERT_RUN` + service role. Regression: `launch-certification-sprint-02.secrets.cert.test.ts`.

**Founder security note:** If a service-role JWT was ever committed historically (`cert-transactional-emails.cjs` / commit era around untrack), **rotate** the Supabase service role key in Dashboard.

---

## Phase 6 — Scheduled jobs (GitHub Actions)

### `expire-stay-booking-requests` — **PASS (infra)**

| Item | Evidence |
|------|----------|
| Schedule | `cron: '12 * * * *'` (hourly) |
| Secrets (names only) | `STAY_REQUEST_EXPIRE_SECRET` / `CRON_SECRET` / `BOOKING_REMINDER_CRON_SECRET` |
| Recent run | `39790063667` (2026-10-22) — **success** |
| Response | HTTP **200** `{"success":true,"expiredCount":0,"bookingIds":[]}` |

### `booking-reminders` — **PARTIAL / ops risk**

| Item | Evidence |
|------|----------|
| Schedule | `5 6 * * *` and `5 7 * * *` UTC + Finland hour-9 gate |
| Intent | One of two UTC fires should hit Finland hour 9; other no-ops |
| Sampled recent runs (25) | **All skipped** — logs show `finland_hour` 13–19, “skipping”; **no HTTP status** in those logs |
| Implication | GHA schedule delay + strict hour gate → reminders may **not** execute on many days unless `workflow_dispatch` is used |
| Change this sprint | **None** — mission forbids modifying production cron schedules |

### Hold expiry

- Edge: `expire-booking-checkout` exists  
- **No** matching GitHub Actions workflow found  
- Runtime schedule for unpaid hold sweep: **NOT VERIFIED** / likely **ENVIRONMENT GAP**

---

## Phase 7 — Founder action checklist (minimal)

Do **not** enable LIVE keys. Use Stripe TEST card `4242…` only.

### F1 — Traveler TEST login (unblocks T1 browser)

| | |
|--|--|
| **Access** | Traveler account password (or magic link) for TEST |
| **Why Cursor cannot** | No credentials; Google sign-in disabled |
| **Steps** | 1) Create/use TEST traveler. 2) On local or preview, open Northern Lights tour → date 23 Oct → Standard Group → Continue → Log in. 3) Complete Stripe TEST Checkout. |
| **Expected** | Trips = paid; supplier bookings = paid; earnings row |
| **Verify** | Screenshots + public booking ref (private note). Stripe TEST Dashboard session paid. |
| **Cursor resume?** | Yes — after login cookie/session or written booking ref, agent can re-check Trips UI read-only |

### F2 — Stay Instant Book / R2B pay (unblocks T2–T6 runtime)

| | |
|--|--|
| **Access** | Traveler + supplier TEST accounts; optional Request-method stay |
| **Why Cursor cannot** | Auth wall; shared DB writes for Checkout/R2B |
| **Steps** | Open `/stays?stay=e21b231b-…` (or apartment from Stays catalog) → select contiguous nights → Reserve → login → Stripe TEST. For R2B: use/create a `request` stay and Accept/Decline as host. |
| **Expected** | Paid or authorized booking; nights occupied per product rules |
| **Verify** | Trips + supplier bookings + Stripe TEST |
| **Cursor resume?** | Yes — after booking refs / session |

### F3 — Stripe TEST webhook + T9

| | |
|--|--|
| **Access** | Stripe Dashboard TEST + confirm edge `whsec` / `sk_test_` |
| **Why Cursor cannot** | No webhook secret locally; must not poke production webhook blindly |
| **Steps** | After F1, redeliver `checkout.session.completed` (or equivalent); confirm single earnings row |
| **Expected** | Idempotent promote; no duplicate ledger |
| **Verify** | `stripe_webhook_events` + Money UI |
| **Cursor resume?** | Partial — contracts already green; runtime needs your event id notes |

### F4 — Mailbox proof (LB-003)

| | |
|--|--|
| **Access** | Traveler + supplier inboxes and/or Resend dashboard |
| **Why Cursor cannot** | Cannot read mailboxes; service-role cert needs your env + `ALLOW_EMAIL_CERT_RUN` |
| **Steps** | After F1 (and F2 R2B), confirm confirmation / supplier / R2B / cancel emails **delivered** |
| **Expected** | Delivered (not only Resend 200) |
| **Verify** | Inbox screenshot or Resend “delivered” |
| **Cursor resume?** | Doc update only |

### F5 — Booking reminders actual send

| | |
|--|--|
| **Access** | GitHub Actions `workflow_dispatch` on **Booking reminders** |
| **Why Cursor cannot** | Schedule runs currently skip; changing cron forbidden this sprint |
| **Steps** | Actions → Booking reminders → Run workflow. Confirm HTTP 2xx in logs. Optionally widen Finland hour window in a follow-up PR. |
| **Expected** | Edge invoked; reminders processed or empty success payload |
| **Verify** | Run log `HTTP status: 200` |
| **Cursor resume?** | Yes — re-read Actions logs |

### F6 — Service role rotation (if ever leaked)

| | |
|--|--|
| **Access** | Supabase Dashboard |
| **Steps** | Rotate service role if historical local cert script contained a JWT |
| **Verify** | Old key rejected; new key only in secrets managers |

### F7 — Optional isolated staging

| | |
|--|--|
| **Access** | Separate Supabase + Stripe TEST webhook endpoint |
| **Why** | Makes T1–T9 **AUTONOMOUS** for Cursor without shared-DB risk |
| **Cursor resume?** | Full payment E2E possible after env switch |

---

## Phase 8 — Defects fixed / not fixed

| Item | Action |
|------|--------|
| Hardcoded service-role risk in email cert script | **Mitigated** — example env template + gitignored stub gate + secrets regression test |
| Money UI “Eligible for next payout” | Already fixed Sprint 01 |
| Stay opened via `/packages?tour=` showed TourDetails | **FIXED** — deep-link resolver + App.tsx rewrite to `/stays?stay=` |
| Booking reminders schedule skips | **Documented** — no cron YAML change (forbidden) |

**No unrelated feature work. Booking architecture preserved.**

---

## Regression coverage

```bash
npx vitest run \
  src/lib/launch-certification-sprint-01.cert.test.ts \
  src/lib/launch-certification-sprint-02.secrets.cert.test.ts \
  src/lib/public-listing-deep-link.test.ts \
  src/lib/commercial-money-engine-v1.test.ts \
  src/lib/booking-hold.test.ts \
  src/lib/stripe-webhook-replay.test.ts \
  src/lib/stripe-test-only.test.ts \
  src/lib/stay-checkout-concurrency.cert.test.ts \
  src/lib/stay-instant-book-no-hold.cert.test.ts \
  src/lib/checkout-inventory-concurrency.cert.test.ts \
  src/lib/stay-webhook-idempotency.cert.test.ts \
  src/lib/multi-departure-inventory.cert.test.ts \
  src/lib/promote-paid-checkout.test.ts \
  src/lib/orphan-checkout-refund.test.ts \
  src/lib/stay-request-approval.test.ts \
  src/lib/admin-booking-ops.test.ts \
  src/lib/financial-recovery-engine.test.ts \
  src/lib/payment-states.test.ts \
  src/data/stay-authorized-cancel-route.test.ts
```

**Result (2026-10-22 Sprint 02):** `Test Files  19 passed (19)` · `Tests  109 passed (109)`

---

## Remaining blockers (updated)

| ID | After Sprint 02 |
|----|-----------------|
| LB-001 LIVE disabled | Still intentional PASS-as-safety |
| LB-002 Manual refunds | Still confirmed product behavior |
| LB-003 Email delivery | Still NOT VERIFIED (mailbox) |
| LB-004 R2B runtime | Still BLOCKED — no stay listing + auth |
| LB-005 Concurrency runtime | Still BLOCKED / UNSAFE on shared DB |
| LB-008 Cron | R2B expire **PASS**; reminders **ops risk** (skips); hold expiry workflow **missing** |
| LB-009 Supplier golden path | Still NOT VERIFIED |
| **New** Auth for checkout | Login required; Google disabled |
| Stay deep-link | **FIXED** this sprint |

---

## Files touched this sprint

| File | Change |
|------|--------|
| `docs/audits/traverion-platform-audit/14-LAUNCH-CERTIFICATION-SPRINT-02.md` | This report |
| `docs/audits/traverion-platform-audit/00-AUDIT-JOURNAL.md` | Sprint 02 journal entry |
| `scripts/cert-transactional-emails.example.cjs` | Env-only email cert template |
| `src/lib/launch-certification-sprint-02.secrets.cert.test.ts` | No hardcoded service-role JWTs in tracked scripts |
| `src/lib/public-listing-deep-link.ts` | Stay vs tour deep-link target helper |
| `src/lib/public-listing-deep-link.test.ts` | Regression coverage |
| `src/App.tsx` | Route stay ids on `/packages?tour=` to StayDetails |

Gitignored (local only): `scripts/cert-transactional-emails.cjs` stub — not committed.

---

## Bottom line

- **Demonstrably working (runtime):** Tour discovery → date → options → checkout **auth gate**; stay PDP + night calendar (after deep-link fix); R2B expire cron HTTP 200; LIVE still blocked; contract pack green.  
- **Not yet E2E-certified:** Paid Stripe TEST booking, R2B accept/decline, webhook replay, mailbox delivery, reminder sends.  
- **Highest-leverage founder actions:** **F1** (traveler login + tour TEST pay) and **F2** (stay Instant Book / R2B pay).  

