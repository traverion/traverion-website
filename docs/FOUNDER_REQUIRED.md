# Traverion — FOUNDER_REQUIRED decisions

**Purpose:** Product/money decisions the autonomous mission must not invent.  
**Stripe:** TEST only until LIVE is explicitly enabled.  
**Updated:** Phase 1036 band (post Phase 1000; remote through 120).

## Open (do not implement unilaterally)

| Decision | Current honest behavior | Risk if invented |
|----------|-------------------------|------------------|
| Auto-refund on eligible cancel | Status **Refund due**; manual Stripe TEST refund docs | Wrong money movement; webhook races |
| Commission / take-rate snapshot | Gross `booking_earnings` only; no fake take-rate UI | Historical bookings rewritten; supplier trust |
| Dedicated traveler auth storage on shared localhost | Autofill harden (904); partner/traveler may share Supabase session on `127.0.0.1` | Cross-role cert pollution; not production host layout |

## Closed since Phase 929 ledger

| Decision | Resolution |
|----------|------------|
| Staff force-unpublish | **Implemented** Phase 1001–1003 (`admin_force_unpublish_listing` + audit + Admin Listings tab) |

## Explicitly not FOUNDER (agents may continue)

- Sitemap build-time regen (1002)
- Listing-image GC on delete (1005)
- Supplier cancel UI honesty cert (1007)
- Rentals/packages honesty (keep non-live)
- SEO/review schema gated on real counts
- Cross-supplier ops ownership guards (108–111)
- Wishlist/cart prune on unpublish (112–113)
- Draft discounts/availability/reviews SELECT gates (114–115/119–120)
- Review write requires paid booking (117–118) + experience started (123)
- Supplier self-notify JWT for welcome/verification (1033)
- Block inventable listings.rating/reviews (122)
- Freeze consumer welcome_email_sent_at (121)

## Before any LIVE money discussion

1. Decide auto-refund vs keep Refund due + manual Stripe.  
2. Decide take-rate % + snapshot at payment time (single source).  
3. Confirm Stripe Connect / payout architecture or keep manual `admin_record_supplier_payout`.  
4. Confirm production host auth separation (traveler / partner / admin).
