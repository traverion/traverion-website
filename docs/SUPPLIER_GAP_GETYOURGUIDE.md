# Supplier side: Traverion vs GetYourGuide

Gap analysis based on GetYourGuide’s **Supply Partner Help Center** (supply.getyourguide.support) and public partner portal behaviour. Use this as a roadmap for Traverion’s supplier portal.

---

## 1. Login & access

| Feature | GetYourGuide | Traverion |
|--------|----------------|-----------|
| Email/password login | ✅ | ✅ (Supabase Auth) |
| Two-factor authentication (2FA) | ✅ | ❌ |
| Email confirmation on signup | ✅ | Depends on Supabase config |
| Supplier-only portal (separate from consumer) | ✅ | ✅ (`/supplier`) |
| Multi-login / user access (team members, roles) | ✅ (Supplier Multi-Login, user access) | ❌ (single user per account) |

**Gaps:** 2FA, multi-user/team access with roles.

---

## 2. Business details & verification

GetYourGuide requires **verified business information** before partners can publish activities. You can’t publish without it.

### Registered company

- Company legal name  
- Company registration number  
- Managing directors’ names  
- Business address  
- Government ID + selfie verification  

### Individual trader

- Legal name  
- Business address  
- Professional licence number (if applicable)  
- Government ID + selfie verification  

### Publishing an activity (both)

- Insurance (if applicable): policy number, coverage, dates, provider  

### Tax / region-specific

- **Payments:** TIN, VAT ID (if VAT registered); US: EIN/SSN/ITIN, W-9, Sales Tax ID; Mexico: RFC  
- Stored under **Company Profile** (account dropdown) and **Legal requirements > Insurance**.

| Feature | GetYourGuide | Traverion |
|--------|----------------|-----------|
| Company / business profile (legal name, address, registration) | ✅ Required for verification | ❌ |
| Identity verification (ID + selfie) | ✅ | ❌ |
| Business type (company vs individual) | ✅ | ❌ |
| Insurance details (for activities) | ✅ Optional/required by activity | ❌ |
| Tax details (TIN, VAT, W-9, etc.) | ✅ Under Payment Details / Finance | ❌ (only payout method stored) |
| Verification status / “verified” badge | ✅ Blocks publishing until done | ❌ |

**Gaps:** Full business profile, verification workflow, tax/legal and insurance storage, verification gate before publishing.

---

## 3. Payments & finance

### Payment setup

- Valid payment details (bank / PayPal)  
- TIN, VAT (if applicable)  
- Payment cycles: monthly or bi-weekly  
- Thresholds: e.g. PayPal 0 EUR, bank 50 EUR (rollover if below)  

### Finance section

- **Invoices** (e.g. Finance > Invoices): per period (monthly/bimonthly), from 1st workday after period; PDF (summary) + Excel (booking list); invoice number (e.g. GIS…).  
- **Payment confirmations** (e.g. Finance > Payment Confirmations): after transfer (e.g. GPS/GS…); PDF + .xlsx with bookings; 3–7 business days to appear.  
- Invoice content: company address, TAX ID, period, total bookings, commission, net payout, currency.  

| Feature | GetYourGuide | Traverion |
|--------|----------------|-----------|
| Payout method (bank / PayPal) | ✅ + TIN, VAT | ✅ Bank (IBAN/BIC) + PayPal email only |
| Tax IDs (TIN, VAT, W-9, etc.) | ✅ | ❌ |
| Payment cycle (monthly / bi-weekly) | ✅ | ❌ (conceptual only in earnings) |
| Minimum payout threshold | ✅ | ❌ |
| **Invoices** (per period, PDF/Excel) | ✅ | ❌ |
| **Payment confirmations / receipts** | ✅ (after each payout) | ❌ |
| Finance dashboard (earnings by period) | ✅ | ✅ (Earnings: pending/paid + table) |
| Commission display on invoice | ✅ | ❌ |

**Gaps:** Tax details, payment cycle and thresholds, **invoices**, **payment confirmations/receipts**, commission handling.

---

## 4. Bookings & management

### Bookings tab

- List/filter by reference, date, status, etc.  
- **Request cancellation** (single booking): reason (customer request, force majeure, operational), optional refund choice, terms acceptance.  
- **Batch cancellation**: select tour/option, timeframe, review affected bookings, stop new bookings (yes/no), reason, confirm; customer options (refund vs reschedule); auto-notify customers; optional block availability.  
- **Contacting customers**: in-portal messaging / email with content guidelines.  
- **Sample voucher** for partners.  
- **Easy acknowledgement** (e.g. confirm receipt of booking).  
- **Bookings for payout** view (understanding what’s included in payout).  

### Cancellation flow

- Single: Show Details > Request Cancellation > reason > extra info (e.g. force majeure justification, refund agreement) > accept terms > submit.  
- After cancellation: customer gets email + in-app notification; choice of full refund or reschedule; supplier notified by email; availability may be blocked.  

| Feature | GetYourGuide | Traverion |
|--------|----------------|-----------|
| Bookings list (guest, date, status, etc.) | ✅ | ✅ |
| Confirm / Cancel (single booking) | ✅ | ✅ |
| **Request cancellation** (with reason + refund choice) | ✅ | ❌ (only “Cancel” status, no reason/refund) |
| **Batch cancellation** (timeframe, tour, reason) | ✅ | ❌ |
| Customer notification on cancel | ✅ (email + app) | ❌ |
| Contact customer (messaging/email) | ✅ | ❌ |
| Booking acknowledgement | ✅ | ❌ |
| Sample voucher / voucher view | ✅ | ❌ |
| “Bookings for payout” view | ✅ | ❌ (earnings table only) |

**Gaps:** Cancellation reasons and refund choice, batch cancellation, customer contact, acknowledgement, vouchers, “bookings for payout” view.

---

## 5. Pickup / planner

- **Pickup planner** (Bookings > Pickup Planner): central view of tours with pickups; prioritises missing pickup info (e.g. within 24h); view by timeslot; export PDF.  
- **Prescheduled pickup times**: set per location at option level; applied to all new bookings (e.g. Hotel A 8:00, Hotel B 8:15).  
- **Per-booking pickup**: edit location, time, instructions.  
- Meeting point / pickup setup when creating/editing products.  

| Feature | GetYourGuide | Traverion |
|--------|----------------|-----------|
| Pickup planner (dashboard by date/tour) | ✅ | ❌ |
| Prescheduled pickup times (per option/location) | ✅ | ❌ |
| Per-booking pickup (location, time, instructions) | ✅ | ❌ |
| Meeting point / pickup in product setup | ✅ | ❌ (only listing fields, no pickup model) |

**Gaps:** Full pickup/meeting-point model and UI (planner, prescheduled times, per-booking edits).

---

## 6. Products (listings) & performance

### Creating and managing products

- Create/edit activities; product options; quality checks; uploading content.  

### Product performance & reviews

- **Reviews** section: see and respond to customer reviews.  
- **Provider rating** (supplier-level).  
- **Insights** (e.g. performance analytics).  
- **Cancellation policy** (configured per product).  
- **Ticket scanners** (if applicable).  
- Badges: “Official Ticket/Tour”, “Likely to sell out”.  
- Ranking explanation; activity quality guidelines; suspension/deactivation.  
- **Alternatives to cancelling** (reduce cancellations).  

| Feature | GetYourGuide | Traverion |
|--------|----------------|-----------|
| Create/edit listings (products) | ✅ | ✅ |
| Draft / published status | ✅ | ✅ |
| Discounts / promos | ✅ | ✅ (listing_discounts) |
| **Reviews** (see + respond) | ✅ | ❌ (reviews exist on consumer side only) |
| **Provider (supplier) rating** | ✅ | ❌ |
| **Insights / performance analytics** | ✅ | ❌ (only dashboard counts) |
| Cancellation policy on product | ✅ | ✅ (cancellation_policy field) |
| Quality checks / approval | ✅ | ❌ |
| Ticket scanners / vouchers | ✅ | ❌ |
| Badges (official, likely to sell out) | ✅ | ❌ |

**Gaps:** Supplier view of reviews and responses, provider rating, insights/analytics, quality workflow, vouchers/scanners, badges.

---

## 7. Account management

- **Company profile**: legal and insurance (see §2).  
- **User access**: manage team members, roles, permissions (and Multi-Login).  
- **Notifications**: customise what you get (e.g. new bookings, cancellations).  
- **Email configuration**: how and where emails are sent.  

| Feature | GetYourGuide | Traverion |
|--------|----------------|-----------|
| Account email / basic profile | ✅ | ✅ (email in Settings) |
| Company / business profile | ✅ | ❌ |
| Payout details (bank/PayPal) | ✅ | ✅ (Settings) |
| **User access / team / roles** | ✅ | ❌ |
| **Notification preferences** | ✅ | ❌ |
| **Email configuration** | ✅ | ❌ |

**Gaps:** Company profile, multi-user/roles, notification and email settings.

---

## 8. Tax & legal

- Tax details (TIN, VAT, W-9, etc.) – see §2 and §3.  
- Dedicated **Tax & Legal** section (VAT, legal, Digital Services Act).  
- Supplier terms acceptance (e.g. when requesting cancellation).  

| Feature | GetYourGuide | Traverion |
|--------|----------------|-----------|
| Tax & Legal section | ✅ | ❌ |
| Storing TIN / VAT / W-9 | ✅ | ❌ |
| Terms acceptance (e.g. on cancel) | ✅ | ❌ |

**Gaps:** Tax/legal section and storage, terms acceptance in flows.

---

## Summary: what to build next (suggested order)

1. **Supplier-facing reviews** – List reviews per listing, optional reply (data already in `reviews`).  
2. **Cancellation with reason + refund** – Store cancellation reason; optional “refund yes/no”; notify customer (email when you have it).  
3. **Invoices & payment confirmations** – Generate PDF (and optionally Excel) per period; payment confirmation document when payout is sent.  
4. **Business profile & verification** – Company/individual fields, verification status, gate “can’t publish until verified”.  
5. **Tax details** – TIN, VAT (and region-specific e.g. W-9) in Settings/Finance; use in invoice generation.  
6. **Customer contact** – In-portal messaging or “email customer” with templates.  
7. **Batch cancellation** – Select by listing + date range, reason, confirm; update statuses and availability.  
8. **Pickup/meeting point** – Model (per listing or per option) + Pickup Planner view + per-booking edit.  
9. **Provider rating & insights** – Supplier-level rating from reviews; simple analytics (views, conversions, cancellations).  
10. **2FA, multi-user, notifications** – Security and team/notification features when scaling.

This doc can be updated as you implement each area. All GYG references are from their public Supply Partner Help Center (supply.getyourguide.support).
