# Gap analysis: Traverion vs GetYourGuide & TripAdvisor

What’s missing on the **customer (consumer)** side and **supplier** side compared to GYG/TripAdvisor.

### Notable progress (keep this in sync when you ship)

- **Reviews (partial):** `reviews` table + tour detail (`TourDetails`) show real reviews and aggregates. **Packages, Home, and destination pages** load batched aggregates for listing cards so suppliers without reviews show **“No reviews yet”** instead of a misleading default score; **Top rated** sort uses real averages (listings with no reviews sort last).
- **Wishlist & cart:** Persisted in Supabase; **`/wishlist`** and **`/cart`** wired; header cart badge when configured.
- **Account:** **`/account`** hub (bookings, wishlist, cart; reviews tile placeholder).
- **Discovery (partial):** **`/destinations/:slug`** destination pages; Packages has shareable query params (`q`, `destination`, `tags`, `price`, `sort`), **removable “Applied” filter chips**, and **deferred search** for smoother typing.
- **Availability (partial):** Booking flow checks capacity / dates when Supabase availability is configured.
- **Supplier notifications (partial):** `notify-supplier-event` edge function added and wired from booking/review writes; sends Resend emails to supplier/team account emails when edge env vars are configured.

Still open: payments, transactional email, full “Places to see” / inspiration nav, time slots, consumer “My reviews”, supplier email notifications, etc.

---

## Consumer side – what’s missing

### 1. **Payments**
- **GYG/TripAdvisor:** Pay at checkout (card, PayPal, etc.); “Reserve now, pay later” or full payment.
- **Traverion:** Booking is **request-only**. No payment step; no Stripe/payment provider. Consumer submits and supplier confirms, but no money is taken.

**Gap:** Add payment (e.g. Stripe): collect payment on confirm step or “pay at activity”; store payment intent/status; refund flow for cancellations.

---

### 2. **Reviews & ratings (real)**
- **GYG/TripAdvisor:** Real reviews after the experience; ratings drive sort/filters and trust; photos, “verified” badge, helpful votes.
- **Traverion (current):** `reviews` table exists; **tour detail** loads reviews + aggregate. **Listing grids** (Packages, Home, destinations) use **batched aggregates** from `reviews` for Supabase listings; zero reviews → honest **“No reviews yet”** on cards (not the listing row default). **Packages** “Top rated” sort uses those aggregates. Seed/demo listings may still show static ratings.
- **Still missing vs GYG:** Post-booking **email** to leave a review; review photos; helpful votes; dedicated **“My reviews”** in the account hub; richer filters (e.g. min rating).

**Gap (remaining):** Email nudge after trip; optional photos/helpful votes; surface “my reviews” in `/account` when ready.

---

### 3. **Wishlist & cart (functional)**
- **GYG/TripAdvisor:** Wishlist = save experiences; cart = add multiple items and checkout together.
- **Traverion (current):** **Supabase wishlist + cart** for logged-in users; **`/wishlist`**, **`/cart`**, header cart count; multi-item **request** flow (not paid checkout).

**Gap:** “Add to wishlist” on every listing surface if not already; **paid** multi-item checkout when payments exist.

---

### 4. **Discovery / navigation**
- **GYG/TripAdvisor:** “Places to see”, “Things to do”, “Trip inspiration” (or similar) with destination/activity browse and landing pages.
- **Traverion (current):** Home search + country filter; **Packages** with URL-synced filters, **Applied** chips, sort options, deferred search; **`/destinations/:slug`** pages for country/city slugs. Header still **no** separate “Places to see” / inspiration mega-nav.

**Gap:** Optional top-nav “Trip inspiration” etc. when content exists; deeper activity taxonomy pages; map browse if desired.

---

### 5. **Availability & times**
- **GYG/TripAdvisor:** Per experience: dates and time slots; “Only 2 left”; calendar with available days.
- **Traverion (current):** Booking asks for **date + guests**; when Supabase is configured, **availability/capacity** can be enforced on submit (see booking flow). No per-slot times in UI yet; “Only X left” not necessarily shown on detail.

**Gap:** Time slots; calendar UX on listing detail; prominent scarcity labels; supplier tooling for slots (see supplier section).

---

### 6. **Customer account & history**
- **GYG/TripAdvisor:** Profile: past bookings, reviews written, wishlist, payment methods, preferences.
- **Traverion (current):** **`/account`** hub linking bookings, wishlist, cart; **My bookings** still directly reachable. No saved payment methods; **My reviews** not wired in hub yet (placeholder tile).

**Gap:** “My reviews” list + saved payments/preferences when you add Stripe and review history.

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
- **Traverion (current):** Cart supports **multiple request bookings** (no single paid checkout). Direct book flow per tour still exists.

**Gap:** Combined **paid** checkout when payments exist; optional vouchers/gifts later.

---

## Supplier side – what’s missing

### 1. **Payouts & finance**
- **GYG/TripAdvisor:** Suppliers have payout method (bank, PayPal); earnings turn into real payouts; statements, invoices.
- **Traverion:** `supplier_earnings` and Earnings page show **pending/paid** and dashboard stats. No payout method in Settings; no actual payouts or bank details.

**Gap:** Payout method in Supplier Settings (e.g. bank details or “paid via platform”); connect to payment provider’s payout (Stripe Connect, etc.); payout history and statements.

---

### 2. **Availability & capacity**
- **GYG/TripAdvisor:** Suppliers set calendar (dates, times, capacity); manage overbooking; sometimes sync with external systems.
- **Traverion (current):** Availability data can exist in Supabase and **consumer booking** can respect capacity (when configured). Supplier-facing calendar/slot UX may still be thin—confirm in-app.

**Gap:** Full supplier calendar UX, time slots, and “Only X left” surfacing on listing pages if not already complete.

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
- **Traverion:** No supplier-level dashboard metrics yet. Listing-level reviews are **real** where guests submit them; aggregates show on listings and cards.

**Gap:** Supplier-level aggregates, response time, cancellation rate; optional badges or quality program.

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
| **Reviews**       | Real reviews + aggregates on detail & cards; no “My reviews” hub yet | No review notifications; limited quality metrics |
| **Wishlist/Cart** | Supabase wishlist + cart; multi-item **requests** | —                                             |
| **Discovery**     | Packages filters + `/destinations/:slug`; no inspiration nav | —                                    |
| **Availability** | Capacity check on book when configured            | Confirm full supplier calendar UX              |
| **Account**       | `/account` hub; payments/review history later       | —                                             |
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
