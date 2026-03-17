# Migrations 006–012: Pre-payment + supplier features

Run these **in order** in the Supabase SQL Editor (or `supabase db push` if using CLI). 006–011 add consumer/supplier features up to (but not including) payment; **012** adds supplier-side business profile, cancellation reason/refund, review replies, pickup fields, and invoice/payment reference.

| Migration | What it adds |
|-----------|----------------|
| **006_reviews.sql** | `reviews` table: listing_id, user_id, booking_id (optional, for “verified”), guest_name, rating (1–5), title, comment, images (jsonb). RLS: public read; users manage own reviews. One review per user per listing (unique index). |
| **007_wishlist.sql** | `wishlist` table: (user_id, listing_id). RLS: users see/add/remove only their own. |
| **008_cart_items.sql** | `cart_items` table: user_id, listing_id, booking_date, guests. RLS: users manage only their own cart. |
| **009_availability_and_cancellation.sql** | `listing_availability` (listing_id, available_date, capacity, booked) + `listings.cancellation_policy` (text). RLS: public read; suppliers manage availability for their listings. |
| **010_supplier_payout_method.sql** | On `supplier_profiles`: payout_method, payout_iban, payout_bic, payout_paypal_email. |
| **011_booking_amount_placeholder.sql** | On `bookings`: total_amount, currency (for when payment is added). |
| **012_supplier_features.sql** | `supplier_profiles`: business_type, company_legal_name, address, tax_id, vat_id, verification_status, insurance fields, payment_cycle, payout_threshold_min. `bookings`: cancellation_reason, refund_choice, cancelled_at, acknowledged_at. `review_replies` table. `listings`: meeting_point, pickup_instructions. `supplier_earnings`: invoice_number, payment_reference. |

## Order

1. 006 → 007 → 008 → 009 → 010 → 011 → 012.

## After running

- **Backend/data layer:** Implement in `src/data/` (e.g. `supabase-reviews.ts`, `supabase-wishlist.ts`, `supabase-cart.ts`, `supabase-availability.ts`), and extend supplier profile fetch/update for payout fields.
- **Frontend:** Wire reviews (submit + list on tour detail), wishlist (header + page), cart (header + cart page), availability (supplier calendar + consumer check), cancellation policy (listing form + tour detail), payout method (Supplier Settings form).
