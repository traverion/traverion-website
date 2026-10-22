# 08 — Feature Inventory

Status: COMPLETE · IMPLEMENTED/UNVERIFIED (IU) · PARTIAL · UI ONLY · BROKEN · MISSING · N/A  
Severity: P0–P3 when action needed.

| Area | Page / Feature | Status | Severity | Evidence | Required Action |
|------|----------------|--------|----------|----------|-----------------|
| Infra | Vite SPA build/deploy | IU | P1 | package.json, vercel.json | Certify prod envs |
| Infra | Host split www/partner/admin | IU | P1 | vercel.json redirects | Certify DNS/HTTPS |
| Infra | Supabase project + RLS | IU | P0 | migrations/ | Staging RLS penetration tests |
| Infra | Edge functions (16) | IU | P0 | supabase/functions | Deploy+secret audit |
| Infra | GH cron reminders | IU | P1 | .github/workflows/booking-reminders.yml | Verify secrets+runs |
| Infra | GH cron R2B expire | IU | P0 | expire-stay-booking-requests.yml | Verify secrets+runs |
| Infra | Analytics provider | UI ONLY | P3 | src/lib/analytics.ts stub | Add provider post-launch |
| Infra | Feature flags platform | MISSING | P3 | — | Optional later |
| Consumer | Home explore | IU | P1 | Home.tsx | TEST browse with live listings |
| Consumer | Destinations covers | PARTIAL | P2 | destinationCover.ts | Prefer listing photos (done); avoid generic mismatch |
| Consumer | Tours browse | IU | P1 | Packages.tsx | Certify filters |
| Consumer | Stays browse | IU | P1 | Stays.tsx | Certify occupancy filters |
| Consumer | Destination page | IU | P2 | DestinationPage.tsx | |
| Consumer | Tour PDP | IU | P0 | TourDetails.tsx | Sticky+quote cert |
| Consumer | Tour checkout BookingPage | IU | P0 | BookingPage.tsx | Stripe TEST cert |
| Consumer | Stay PDP | IU | P0 | StayDetails.tsx | Calendar+R2B cert |
| Consumer | Auth | IU | P0 | AuthPage.tsx | Signup/login/reset cert |
| Consumer | Reset password | IU | P1 | ResetPasswordPage.tsx | |
| Consumer | Trips MyBookings | IU | P0 | MyBookings.tsx | Cancel/Pay now cert |
| Consumer | Wishlist | IU | P2 | WishlistPage.tsx | |
| Consumer | Account hub | PARTIAL | P2 | AccountPage.tsx | Expand settings later |
| Consumer | Booking confirmation | IU | P0 | BookingConfirmationPage.tsx | Reconcile cert |
| Consumer | Cart multi-item | UI ONLY/PARTIAL | P2 | CartPage soft-retire | Keep hold UI or fold into Trips |
| Consumer | Blog | UI ONLY | P3 | Blog.tsx honest empty | Keep or unroute |
| Consumer | Experiences reserved | UI ONLY | P3 | ReservedInventoryPage | Keep honest |
| Consumer | Legal/contact/about | IU | P1 | pages/* | Legal accuracy review |
| Consumer | Header nav typography | IU | P3 | UnifiedHeader + Inter | Done recently |
| Booking | Server quote authority | IU | P0 | create-booking-checkout-session | Cert mismatch attacks |
| Booking | Instant Book inventory 257 | IU | P0 | mig 257 | Concurrent booking cert |
| Booking | Stripe webhook promote | IU | P0 | stripe-webhook, promote-paid | Replay+orphan cert |
| Booking | Reconcile return path | IU | P0 | reconcile-checkout-session | |
| Booking | Stay R2B authorize/capture | IU | P0 | stay-booking-request-action | Full matrix T4–T7 |
| Booking | Traveler cancel | PARTIAL | P1 | cancel RPC; no auto refund | Ops playbook |
| Booking | Prepared refund instruction | PARTIAL | P1 | mig 241 | Manual Stripe execute |
| Finance | Earnings ledger | IU | P1 | commercial money 238 | UI test drift fix |
| Finance | Auto payouts / Connect | MISSING | P1 | — | Decide model before LIVE |
| Finance | Commission take-rate | PARTIAL | P0 | 0% MoR historically | Owner decision |
| Supplier | Auth/onboarding | IU | P0 | SupplierAuth, PartnerOnboarding | Golden path cert |
| Supplier | Verification gates | IU | P0 | publish gate | Admin approve cert |
| Supplier | Listings CRUD | IU | P0 | SupplierListings | |
| Supplier | Tour creator | IU | P0 | SupplierListingForm | Publish→PDP parity |
| Supplier | Stay creator | IU | P0 | StayOnboardingFlow | Type/pricing honesty |
| Supplier | Availability desk | IU | P1 | SupplierAvailability | |
| Supplier | Stay calendar | IU | P1 | SupplierStayCalendar | |
| Supplier | Bookings/reservations | IU | P0 | SupplierBookings | |
| Supplier | Pickup planner | IU | P0 | SupplierPickupPlanner | Meeting-point visibility cert |
| Supplier | Inbox | IU | P1 | SupplierInbox | |
| Supplier | Earnings | PARTIAL | P1 | SupplierEarnings | Payout honesty |
| Supplier | Discounts/offers | IU | P2 | SupplierDiscountsOffers | |
| Supplier | Reviews | IU | P2 | SupplierReviews | |
| Supplier | Performance | PARTIAL | P3 | SupplierPerformance | Not BI |
| Supplier | Team invites | UI ONLY | P2 | Coming Soon | |
| Supplier | Rentals product | UI ONLY | N/A | Explicitly blocked | Out of scope |
| Supplier | Multi-unit stays publish | MISSING intentional | P2 | Publish gate blocks | Future |
| Supplier | PartnerHelpPage file | UI ONLY | P3 | Unused orphan | Delete or wire later |
| Admin | Staff login + allowlist | IU | P0 | AdminGate, public.admin | Pen-test |
| Admin | Verification queues | IU | P0 | admin-supplier-verification | |
| Admin | Bookings panel | IU | P1 | AdminBookingsPanel | |
| Admin | Listings moderation | IU | P1 | | |
| Admin | Finance / record payout | PARTIAL | P1 | Manual | |
| Admin | Refund execute | MISSING intentional | P1 | Prepare only | Ops |
| Admin | Content reports | IU | P1 | | |
| Admin | Marketplace wipe | IU | P0 | Dangerous | Protect+runbook |
| Notify | Customer transactional | IU | P0 | notify-customer-booking | Mailbox proof |
| Notify | Supplier transactional | IU | P0 | notify-supplier-event | Mailbox proof |
| Notify | Reminders/review request | IU | P2 | send-booking-reminders | Cron proof |
| Security | Webhook signatures | IU | P0 | stripe-webhook | |
| Security | Storage policies | IU | P1 | migrations 15x | |
| Security | GDPR delete/export | MISSING | P2 | | Plan before EU scale |
| SEO | Sitemap generate | IU | P2 | prebuild script | Prod fetch |
| SEO | robots admin noindex | IU | P2 | vercel headers | |

---

## Estimation note

Rows marked **IU** dominate because this audit prioritized code truth over claiming runtime COMPLETE. Prior founder report (2026-10-05) claimed many PASS results on Stripe TEST—those are valuable history but **not re-executed here**.
