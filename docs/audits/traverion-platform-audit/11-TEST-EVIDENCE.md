# 11 — Test Evidence

**Audit session:** 2026-10-22  
**Environment:** Local Mac repo + local Vite (`127.0.0.1:5176` observed earlier)  
**Stripe LIVE:** Not used  
**Production DB writes:** None  

---

## Commands executed (this audit)

| Command | Result |
|---------|--------|
| `find` / `ls` inventory of migrations, functions, tests | OK — 262 migrations, 16 functions, ~589 tests |
| `npx vitest run src/lib/booking-hold.test.ts src/lib/stripe-webhook-replay.test.ts src/lib/stay-checkout-concurrency.cert.test.ts src/lib/commercial-money-engine-v1.test.ts` | **3 passed files / 1 failed file** |
| Failure detail | `commercial-money-engine-v1.test.ts` expects UI string `Eligible for next payout` — not found |
| `npx eslint src/App.tsx --max-warnings 0` | Exit 0 |
| Prior session: homepage browser smoke, destination image URLs, nav typography CDP | Finland/Rovaniemi listing covers; Inter 800 nav metrics |

---

## Tests passed (sample critical)

- `booking-hold.test.ts` — Instant pending vs authorized occupy rules  
- `stripe-webhook-replay.test.ts` — replay decision helper  
- `stay-checkout-concurrency.cert.test.ts` — concurrency contracts  

Full suite **not** run in this audit (too large; would mix signal). Historical founder report claimed broad PASS on Stripe TEST (2026-10-05) — **not re-run**.

---

## Tests failed

| Test | Issue | Impact |
|------|-------|--------|
| commercial-money-engine-v1 “Eligible for next payout” | UI copy drift | P1/P2 — earnings messaging may have changed; contract outdated or UI regress |

---

## Runtime checks performed

| Check | Result |
|-------|--------|
| Local consumer homepage load | OK (prior in session) |
| Destination tile sources | Listing-images URLs for Finland & Rovaniemi (not vacation1/banner1) |
| Date popover open | OK |
| Mobile menu Explore/Tours/Stays typography | Inter 800 / 14px / uppercase |
| Partner portal login | **NOT PERFORMED** |
| Admin login | **NOT PERFORMED** |
| Stripe Checkout | **NOT PERFORMED** |
| Webhook delivery | **NOT PERFORMED** |
| Email inbox | **NOT PERFORMED** |
| GH Action cron live run | **NOT PERFORMED** (files present only) |
| Lighthouse / CWV | **NOT PERFORMED** |
| RLS negative tests as second user | **NOT PERFORMED** |

---

## Environment limitations

- No guaranteed access to partner/admin credentials in this session  
- `.env` not inspected for secrets (policy)  
- Production Supabase/Stripe dashboards not queried  
- Cannot claim mailbox or LIVE readiness  

---

## Untested workflows (must certify before real bookings)

See matrix T1–T10 in `05-BOOKINGS-PAYMENTS-FINANCE.md` and Phase A in `10-DEVELOPMENT-ROADMAP.md`.

Additionally:

- Supplier publish after dual verification  
- Pickup confirm → traveler email  
- Host cancel request → traveler accept/decline  
- Content report → admin hide review  
- Offer/discount redemption at checkout  
- Password reset email  

---

## Known false positives / caveats

- Presence of a page, migration, or prior PASS report ≠ verified today  
- `IMPLEMENTED/UNVERIFIED` is the honest default for wired features  
- UI ONLY placeholders (Blog, Experiences, Rentals) are **not** failures if not sold  
- Cart URL still works while navigate('cart') goes to Trips — dual path can confuse testers  

---

## Reproduction notes for the failed money test

```bash
npx vitest run src/lib/commercial-money-engine-v1.test.ts
```

Expect assertion on Supplier Earnings source containing `Eligible for next payout`. Update UI or test after product decision on payout copy.
