# GetYourGuide / TripAdvisor parity – roadmap

Long-term plan to align Traverion with GYG/TripAdvisor: page-by-page, supplier product/discounts/finance, and one clean consumer booking flow.

---

## 1. Consumer side (main site)

### 1.1 Home
- [x] Hero with search + country filter
- [x] Popular experiences (3 hardcoded cards)
- [x] Listings grid (search-driven)
- [x] Trust strip: Free cancellation, Best price guarantee, Verified reviews

### 1.2 Listings / search (Packages)
- [x] Keyword search, destination (country) filter
- [x] Tags filter chips (free cancellation, small group, etc.)
- [x] Sort: Recommended, Price, Rating, Duration
- [x] Card: image, title, price, rating, duration, tags
- [x] URL state for filters (shareable links); popstate sync; Clear all filters

### 1.3 Tour detail page
- [x] Gallery, title, price, CTA
- [x] Sticky booking widget (right column)
- [x] Trust badges under CTA: Free cancellation, Best price guarantee, Reserve now pay later

### 1.4 Booking flow (one clean page)
- [x] Single booking page: date & guests → contact (name, email) → confirm → done
- [x] Minimal fields; persists to `bookings`
- [x] Optional: special requests field (contact step + DB column special_requests)

### 1.5 Footer & legal
- [x] Contact, Privacy, Terms, Cookies
- [x] GYG-style footer: compact columns (Discover, Support), trust line, bottom bar with legal links

---

## 2. Supplier side

### 2.1 Auth & layout
- [x] Login / signup (Supabase Auth)
- [x] Sidebar: Dashboard, My listings, Bookings, Earnings, Settings
- [x] Optional: “For suppliers” landing before login (hero + benefits + Log in or sign up)

### 2.2 Product management (listings)
- [x] Create listing (form)
- [x] Edit / delete listing
- [x] List view: title, status, price, quick edit (table + status toggle)
- [x] Draft vs published (status field; migration 003)
- [x] Image URL in form (with placeholder and hint)

### 2.3 Special discounts
- [x] Data: `listing_discounts` (migration 002); CRUD in supabase-discounts.ts
- [x] UI: “Special discounts” section in listing form (when editing); add/delete, optional code and dates
- [x] Show discounted price on listing card and detail when valid (getValidDiscount + fetchDiscountsByListingIds)

### 2.4 Finance
- [x] Data: `supplier_earnings` (migration 002); fetch in supabase-earnings.ts
- [x] Earnings page: pending/paid summary cards + history table (empty until data)
- [x] Dashboard: earnings this month from supplier_earnings (+ bookings this month, earnings pending)
- [ ] Optional: payout method in Settings

### 2.5 Bookings (supplier view)
- [x] Placeholder bookings page
- [x] List bookings for supplier’s listings (from `bookings` where listing_id in supplier’s listings)
- [x] Status: pending / confirmed / cancelled; quick Confirm/Cancel actions

---

## 3. Data & backend

- [x] `listings`, `bookings`, `contact_inquiries`, `supplier_profiles`
- [x] `listing_discounts` (migration 002)
- [x] `supplier_earnings` (migration 002)
- [x] RLS for new tables
- [x] Migration 003: listings.status (draft/published), bookings.guest_name, suppliers can update booking status

---

## 4. Order of implementation

1. **Migration 002**: discounts + earnings/payouts tables  
2. **Supplier**: discounts CRUD, finance (earnings) page + dashboard stats  
3. **Consumer**: one clean booking page (date, guests, contact → confirm)  
4. **Main site**: polish home, listings, tour detail, footer to GYG style  

All in one codebase; remove legacy/incorrect flows as we go.
