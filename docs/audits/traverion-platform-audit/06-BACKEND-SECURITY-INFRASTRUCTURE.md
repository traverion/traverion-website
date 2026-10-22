# 06 — Backend, Security & Infrastructure

---

## Architecture snapshot

- **Frontend:** Vite + React 18 SPA (`dist` on Vercel)  
- **Routing:** Client page-key router (`App.tsx`, `appRouting.ts`) — not React Router  
- **Data:** Supabase Postgres + RLS + RPCs  
- **Compute:** Supabase Edge Functions (Deno), `verify_jwt = false` with in-function auth  
- **Payments:** Stripe Checkout + webhooks (server-side only; no stripe npm in app)  
- **Email:** Resend via transactional helpers  
- **Hosts:** www / partner / admin split (`vercel.json`)  
- **Schedulers:** GitHub Actions (reminders, expire R2B) — not Vercel Cron  

Counts (2026-10-22): **262** migrations, **16** edge function entrypoints, **~589** vitest files, **2** GH cron workflows.

---

## Database & integrity

| Topic | Assessment |
|-------|------------|
| Migrations density | Very high; iterative honesty fixes (inventory, promote, R2B, money) |
| Dual models risk | Cart_items vs bookings holds; commercial snapshots vs live listing — mitigated by promote asserts |
| Orphans | Listing delete restrict; expire/reconcile paths for checkout orphans |
| Indexes / FKs | Present across booking/payment tables (sampled via migration names) |
| RLS | Supplier team, booking party, listings — **IMPLEMENTED/UNVERIFIED runtime** |
| Backup/PITR | Supabase project config **NOT VERIFIED** in this audit |

---

## Edge functions inventory

| Function | Role |
|----------|------|
| create-booking-checkout-session | Start checkout / quote / hold claim |
| stripe-webhook | Payment lifecycle |
| reconcile-checkout-session | Traveler return path promote |
| expire-booking-checkout | Unpaid session expiry |
| stay-booking-request-action | R2B accept/decline/withdraw |
| expire-stay-booking-requests | R2B timeout |
| notify-customer-booking | Traveler emails |
| notify-supplier-event | Supplier emails |
| send-booking-reminders | Reminder + review request |
| send-supplier-message | Manual supplier email |
| admin-supplier-verification | Admin privileged ops |
| notify-staff-verification-queue | Staff queue notify |
| notify-contact-inquiry | Contact form |
| submit-partner-support | Partner support |
| communication-upload-session | Attachment upload |
| communication-attachment-access | Attachment access |

---

## Security & privacy

| Control | Status | Notes |
|---------|--------|-------|
| Auth sessions (Supabase) | IMPLEMENTED/UNVERIFIED | |
| Password reset | IMPLEMENTED/UNVERIFIED | |
| Supplier isolation (RLS/team) | IMPLEMENTED/UNVERIFIED | |
| Admin allowlist + role | IMPLEMENTED/UNVERIFIED | Correct pattern |
| Stripe webhook signature | COMPLETE (code) | `constructEventAsync` + secret required |
| Storage buckets policies | IMPLEMENTED/UNVERIFIED | listing-images, logos, verification |
| Secrets management | PARTIAL | `.env.example` documents; deployed secrets NOT VERIFIED; **do not commit secrets** |
| Input validation | PARTIAL | Edge quotes + RPCs; full XSS audit NOT DONE |
| Rate limiting | PARTIAL / MISSING product-wide | Rely on platform defaults — NOT VERIFIED |
| PII in logs | UNKNOWN | Needs log sampling in staging |
| GDPR self-serve delete/export | MISSING / PARTIAL | |
| Consent / cookies page | IMPLEMENTED/UNVERIFIED | Legal pages exist |

**Safe rule followed:** `.env` / live secrets not read or printed in this audit.

---

## Notifications

Customer kinds include: booking_request, booking_confirmed_paid, pickup_*, cancel family, messages, refunds, reminders, review_request, etc.  
Supplier kinds include: new_booking, cancel, review, guest_message, verification, refunds, etc.  

**Delivery mailbox proof: NOT VERIFIED this audit.** Soft-fail honesty is intentional (booking truth ≠ email).

---

## Reliability / ops

| Item | Status |
|------|--------|
| GH Action booking reminders (Finland 09:00) | Present in repo; secrets NOT VERIFIED |
| GH Action expire R2B hourly | Present; secrets NOT VERIFIED |
| Monitoring / alerting product | PARTIAL / MISSING | No Datadog/Sentry productization found in app |
| Feature flags system | MISSING | Env-based gates (Stripe TEST) instead |
| Health endpoint | Documented in launch checklist (`/health.txt`) — NOT hit this audit |

---

## Performance (backend)

| Concern | Notes |
|---------|-------|
| Catalog fetches | Client hooks + published filters; N+1 risk possible on home discounts/reviews |
| Inbox | Perf-oriented tests exist (`inbox-latest-message-perf.test.ts`) |
| Heavy listing form bundles | Large vendor chunks in build output historically |
| Measured CWV | **NOT MEASURED** this audit |

---

## Infrastructure completion estimate

- **Code/infra coverage:** ~75% for early marketplace  
- **Verified:** workflow files + selective tests; deploy/cron/email secrets unproven here  
