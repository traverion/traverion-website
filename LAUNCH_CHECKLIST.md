# TRAVERION Launch Checklist

Last updated: 2026-03-26
Owner: Launch lead

Use this as a strict go/no-go checklist.  
Mark each item `[x]` only after verifying in production.

## 1) Platform + Infra (P0)

- [ ] Production domain is connected and HTTPS is active (`https://traverion.com`).
- [ ] `robots.txt` and `sitemap.xml` are live and accessible.
- [ ] Vercel env vars are set:
  - [ ] `VITE_SUPABASE_URL`
  - [ ] `VITE_SUPABASE_ANON_KEY`
  - [ ] `VITE_SITE_URL`
- [ ] Supabase function secrets are set:
  - [ ] `RESEND_API_KEY`
  - [ ] `SUPPLIER_EMAIL_FROM`
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Health endpoint responds (`/health.txt` returns `OK`).

## 2) Customer Journey (P0)

- [ ] Home page loads cleanly on desktop and mobile.
- [ ] Packages search + filters + sorting work.
- [ ] Listing detail page renders correctly.
- [ ] Booking request submits successfully.
- [ ] Auth works (sign up + sign in + sign out).
- [ ] Account hub (`/account`) shows cards/counts.
- [ ] Wishlist/cart/bookings pages open and empty states are clear.
- [ ] Booking cancellation flow works with correct status updates.

## 3) Supplier Journey (P0)

- [ ] Supplier login path works (`/supplier-log-in`).
- [ ] Supplier dashboard loads stats + quick start.
- [ ] Listing create/edit works.
- [ ] Bookings workflow works:
  - [ ] acknowledge
  - [ ] confirm
  - [ ] cancel
  - [ ] filters + empty states
- [ ] Pickup planner loads and filters correctly.
- [ ] Settings save correctly:
  - [ ] company profile
  - [ ] payout details
  - [ ] notification preferences

## 4) Notifications + Email (P0)

- [ ] New booking triggers supplier notification email.
- [ ] Booking cancellation triggers supplier notification email.
- [ ] New review triggers supplier notification email.
- [ ] Supplier manual message send works from bookings.
- [ ] Sender address and subject format look professional.

## 5) Legal + Trust (P0)

- [ ] Legal Notice page is complete and accurate.
- [ ] Privacy Policy page is complete and accurate.
- [ ] Terms page is complete and accurate.
- [ ] Contact email + phone are correct and reachable.
- [ ] Footer social links are correct:
  - [ ] Instagram `@traverionco`
  - [ ] TikTok `@traverion.com`

## 6) SEO + Sharing (P1)

- [ ] Canonical tags set correctly on key pages.
- [ ] OG/Twitter preview looks good when sharing homepage and a package page.
- [ ] Sitemap includes all public pages only.
- [ ] Private routes are excluded from indexing.

## 7) Performance + UX (P1)

- [ ] Main pages pass a basic Lighthouse check (mobile and desktop).
- [ ] No broken images/icons in header/footer/cards.
- [ ] Core flows feel responsive on mobile Safari and Chrome.

## 8) Rollback + Monitoring (P1)

- [ ] Last known good deploy is identified.
- [ ] Team knows rollback procedure in Vercel.
- [ ] Supabase logs and function logs are accessible.
- [ ] Error triage owner is assigned for launch week.

## Go / No-Go

- [ ] GO: all P0 items above are complete.
- [ ] NO-GO: any P0 item unresolved.

