# Traverion — Phase 1073

**Mission:** Marketplace completeness continuum after Phase 1072  
**Branch:** `reconstruction/phase-0-audit`  
**Stripe:** TEST only  
**Remote migrations:** through **126** (no new migration)

---

## Problem

`send-booking-reminders` compared `booking_date` to **UTC** tomorrow/yesterday. Listings with non-UTC experience timezones misfired near midnight. Stay review prompts used `booking_date` (check-in), so travelers could get “How was your stay?” mid-visit.

## Canonical truth

| Workflow | Event | TZ | Instant vs date |
|----------|--------|-----|-----------------|
| Reminder | Day before tour departure / stay **check-in** | `purchase_snapshot.departureTimezone` | Local calendar date |
| Review email | Day after tour departure / stay **check-out** | same | Local calendar date |
| Idempotency | `*_email_sent_at` + notify key | — | Stamp once |

## Fix

1. `booking-lifecycle-calendar.ts` (+ Deno mirror): pure eligibility helpers + boundary tests.
2. Cron selects a wide UTC candidate window, then filters per booking local calendar.
3. Stay reviews require check-out (column or snap); never check-in alone.

## Certification

- AUTOMATED-TESTED: `booking-lifecycle-calendar.test.ts`, mirror sync
- Deployed: `send-booking-reminders`
