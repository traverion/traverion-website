# Gap analysis: Traverion vs GetYourGuide & TripAdvisor

What’s missing on the **customer (consumer)** side and **supplier** side compared to GYG/TripAdvisor.

---

## Consumer side – what’s missing

### 1. **Payments**
- **GYG/TripAdvisor:** Pay at checkout (card, PayPal, etc.); “Reserve now, pay later” or full payment.
- **Traverion:** Booking is **request-only**. No payment step; no Stripe/payment provider. Consumer submits and supplier confirms, but no money is taken.

**Gap:** Add payment (e.g. Stripe): collect payment on confirm step or “pay at activity”; store payment intent/status; refund flow for cancellations.

---

### 2. **Reviews & ratings (real)**
- **GYG/TripAdvisor:** Real reviews after the experience; ratings drive sort/filters and trust; photos, “verified” badge, helpful votes.
- **Traverion:** Listings have `rating` and `reviews` in DB (often default 4.5 / 0). Some pages use mock data from `src/data/reviews.ts`. No table for customer reviews, no post-booking “Leave a review” flow.

**Gap:** `reviews` table (listing_id, booking_id or guest_email, rating, comment, date, optional photos); post-booking email/link to leave review; aggregate rating/review count on listing; show real reviews on tour detail; optionally use in “Sort by rating” and filters.

---

### 3. **Wishlist & cart (functional)**
- **GYG/TripAdvisor:** Wishlist = save experiences; cart = add multiple items and checkout together.
- **Traverion:** Header has Wishlist and Cart **UI only** (placeholders). No save/list, no cart, no multi-item checkout.

**Gap:** Wishlist: persist saved listing IDs (user account or localStorage), wishlist page, “Add/remove from wishlist” on cards and detail. Cart: cart table or session, add to cart, cart page, then one checkout for multiple items (when payments exist).

---

### 4. **Discovery / navigation**
- **GYG/TripAdvisor:** “Places to see”, “Things to do”, “Trip inspiration” (or similar) with destination/activity browse and landing pages.
- **Traverion:** Intentionally **skipped for now** (no “Places to see” etc. in header). Home has search + country filter; Packages has search/filters. No destination/activity taxonomy landing pages.

**Gap:** When you have enough tours: add “Places to see”, “Things to do”, “Trip inspiration” (or your naming) with real links and, later, destination/activity category pages.

---

### 5. **Availability & times**
- **GYG/TripAdvisor:** Per experience: dates and time slots; “Only 2 left”; calendar with available days.
- **Traverion:** Booking asks for **date + guests** only. No availability check; no time slots; no capacity limits. Any date can be submitted.

**Gap:** Availability model (e.g. per listing: available dates, times, capacity); check availability before/during booking; disable fully booked dates; optional “Only X left” on detail and in widget.

---

### 6. **Customer account & history**
- **GYG/TripAdvisor:** Profile: past bookings, reviews written, wishlist, payment methods, preferences.
- **Traverion:** Logged-in user has **My Bookings** (via RLS) and logout. No profile page, no saved payment methods, no “My reviews” or “My wishlist” hub.

**Gap:** Profile/dashboard: bookings, wishlist, reviews written; later: saved payment methods, preferences (currency, notifications).

---

### 7. **Communications**
- **GYG/TripAdvisor:** Booking confirmation, reminder, cancellation emails; sometimes in-app messages.
- **Traverion:** No emails. User and supplier only see status in app.

**Gap:** Transactional email (e.g. Resend/SendGrid): booking received, booking confirmed/cancelled, reminder before date; optional “Leave a review” after the tour.

---

### 8. **Trust & support**
- **GYG/TripAdvisor:** Clear cancellation policy (e.g. “Free cancellation 24h before”); customer support (chat/phone); sometimes insurance/guarantees.
- **Traverion:** Trust badges (Free cancellation, Best price, etc.) are **copy only**. No policy engine, no support channel beyond Contact form.

**Gap:** Define and display real cancellation rules (per listing or global); link to support; optional live chat or status page.

---

### 9. **SEO & content**
- **GYG/TripAdvisor:** Strong SEO: destination pages, activity pages, unique titles/descriptions, structured data.
- **Traverion:** Basic SEO (e.g. setPageMeta). No dedicated destination/activity landing pages; blog exists but not wired into discovery.

**Gap:** Per-listing and per-destination meta + structured data; destination/activity landing pages; use blog for “Trip inspiration” when you add that nav.

---

### 10. **Multi-item & checkout UX**
- **GYG/TripAdvisor:** Add to cart → cart page → one checkout for several experiences; vouchers/gift cards in some cases.
- **Traverion:** One booking per tour, one page per booking. No cart, no combined checkout.

**Gap:** Covered by cart + payments above: cart, combined checkout, optional voucher/gift later.

---

## Supplier side – what’s missing

### 1. **Payouts & finance**
- **GYG/TripAdvisor:** Suppliers have payout method (bank, PayPal); earnings turn into real payouts; statements, invoices.
- **Traverion:** `supplier_earnings` and Earnings page show **pending/paid** and dashboard stats. No payout method in Settings; no actual payouts or bank details.

**Gap:** Payout method in Supplier Settings (e.g. bank details or “paid via platform”); connect to payment provider’s payout (Stripe Connect, etc.); payout history and statements.

---

### 2. **Availability & capacity**
- **GYG/TripAdvisor:** Suppliers set calendar (dates, times, capacity); manage overbooking; sometimes sync with external systems.
- **Traverion:** Suppliers don’t set availability. Bookings are just “pending → confirmed/cancelled”. No calendar, no slots, no capacity.

**Gap:** Supplier UI to set available dates/times and capacity per listing; use this to drive consumer availability and “Only X left”.

---

### 3. **Notifications**
- **GYG/TripAdvisor:** New booking, cancellation, review, payout emails; in-app or dashboard alerts.
- **Traverion:** No supplier notifications. Supplier must open dashboard to see new bookings.

**Gap:** Email (and optionally in-app) for: new booking, booking cancelled, new review; later: payout sent, policy changes.

---

### 4. **Product richness**
- **GYG/TripAdvisor:** Multiple time slots, variants (e.g. “With pickup” vs “Without”), add-ons, pricing tiers (adult/child).
- **Traverion:** One price per listing (`price_starting_from`); optional discounts. No variants, add-ons, or tiered pricing.

**Gap:** Optional: variants, add-ons, adult/child pricing; then availability and booking flow need to support “which option” and price calculation.

---

### 5. **Performance & quality**
- **GYG/TripAdvisor:** Supplier ratings, response time, cancellation rate; sometimes “Partner badge” or quality program.
- **Traverion:** No supplier-level rating or performance metrics. Only listing-level rating/reviews (and reviews are not real yet).

**Gap:** Once reviews are real: supplier-level aggregates, response time, cancellation rate; optional badges or quality program.

---

### 6. **Support & disputes**
- **GYG/TripAdvisor:** Support for suppliers (payout issues, disputes, policy questions).
- **Traverion:** No dedicated supplier support; only generic Contact.

**Gap:** Supplier help/contact, FAQ, and (when payments exist) dispute/refund process.

---

## Summary table

| Area              | Consumer gap                                      | Supplier gap                                  |
|-------------------|---------------------------------------------------|-----------------------------------------------|
| **Money**         | No payment at checkout                            | No payout method / real payouts               |
| **Reviews**       | No real reviews; mock or static rating/review count | No review notifications; no quality metrics  |
| **Wishlist/Cart** | UI only; no save, no cart, no multi-item checkout | —                                             |
| **Discovery**     | No “Places to see” / “Things to do” / inspiration | —                                             |
| **Availability** | No dates/times/capacity check                     | No calendar/slots/capacity management         |
| **Account**       | No profile, no “My reviews” / “My wishlist”       | —                                             |
| **Comms**         | No booking/review emails                          | No new-booking/cancel/review emails            |
| **Trust/Support** | Policies and support not enforced                 | No dedicated supplier support                 |
| **Product**       | —                                                 | No variants, add-ons, tiered pricing          |

---

## Suggested order of implementation

1. **Payments (consumer) + Payout method (supplier)** – so bookings turn into real money and supplier earnings become real payouts.
2. **Real reviews** – table, post-booking flow, show on listing/detail; then supplier review notifications and basic quality metrics.
3. **Availability & capacity** – supplier sets it; consumer sees it and can’t overbook.
4. **Wishlist then Cart** – wishlist first (simpler), then cart + multi-item checkout when payments exist.
5. **Email** – booking and cancellation for both sides; “Leave a review” for consumers.
6. **Discovery** – “Places to see” / “Things to do” / “Trip inspiration” and destination/activity pages when you have enough content.
7. **Profile & account** – “My wishlist”, “My reviews”, then saved payment methods if needed.
8. **Policies & support** – cancellation rules, support channel, then (if needed) variants/add-ons and supplier performance metrics.

This doc can be updated as you implement each piece.
