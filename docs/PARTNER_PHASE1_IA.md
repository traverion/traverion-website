# Partner Phase 1 — Route audit & information architecture

**Starting SHA:** `cbe5d914f899b4e3b0887171f3cd5448f97e7a27`  
**Scope:** Visual system + IA only (Partner / supplier). Functional truth preserved.

---

## Discovered Partner routes

| Route | Section | Purpose | Nav (before) | Decision |
|-------|---------|---------|--------------|----------|
| `/partner` | dashboard | Operational Today home | Primary | KEEP · VISUALLY REBUILD |
| `/partner/today` | → dashboard | Alias | — | KEEP alias |
| `/partner/bookings` | bookings | Booking list + detail | Primary | KEEP · VISUALLY REBUILD |
| `/partner/calendar` | availability | Availability / calendar | Primary | KEEP · VISUALLY REBUILD |
| `/partner/availability` | → availability | Alias | — | KEEP alias |
| `/partner/listings` | listings | Inventory list + editor | Primary | KEEP · VISUALLY REBUILD chrome |
| `/partner/tours` | → listings | Alias | — | KEEP alias |
| `/partner/inbox` | inbox | Guest messages | Desktop primary / Business mobile | MOVE to Operate group · VISUAL |
| `/partner/money` | earnings | Finance truth | Primary | KEEP · VISUALLY REBUILD |
| `/partner/earnings` | → earnings | Alias | — | KEEP alias |
| `/partner/reviews` | reviews | Reviews workspace | Business dropdown | PROMOTE to sidebar · VISUAL |
| `/partner/discounts` | discounts | Offers / promos | Business dropdown | PROMOTE · RENAME label Offers · VISUAL |
| `/partner/pickup` | pickup | Pickup / logistics | Business dropdown | PROMOTE · VISUAL |
| `/partner/performance` | performance | Honest performance | Business dropdown | PROMOTE · VISUAL |
| `/partner/business-profile` | business-profile | Business identity | Avatar | MOVE to Business nav · KEEP |
| `/partner/settings` | → business-profile | Alias | — | KEEP alias |
| `/partner/account-settings` | account-settings | Personal account | Avatar | Avatar + Business nav · KEEP |
| `/partner/account` | → account-settings | Alias | — | KEEP |
| `/partner/change-password` | change-password | Password | Nested | KEEP under account |
| `/partner/onboarding` | onboarding | Setup checklist | Avatar (if incomplete) | KEEP · surface when incomplete |
| `/partner/team`, `/partner/integrations` | — | Not built | 404 copy | PRESERVE unknown-path message (no fabricate) |
| `/login`, `/signup`, `/reset-password`, `/email-verified` | auth | Partner auth | Outside shell | PRESERVE (Issue A deferred) |
| Marketing static | legal | ToS / privacy / etc. | Outside shell | PRESERVE |

---

## Final information architecture (Phase 1)

### Operate (high frequency)
- Today  
- Calendar  
- Bookings  
- Inbox  
- Listings  

### Operations
- Pickup  
- Reviews  
- Offers  

### Insights
- Performance  
- Money  

### Business
- Business profile  
- Account settings  
- Finish setup *(conditional)*  

### Avatar / account menu (identity only)
- Identity (email)  
- Account settings  
- Log out  
- *(optional)* Finish setup  

**Not in avatar:** Calendar, Reviews, Offers, Pickup, Performance, Finance, Inbox, Bookings, Listings.

### Mobile
- Bottom bar: Today · Bookings · Calendar · Listings · Money *(unchanged 5-slot constraint)*  
- **More** sheet: Operate (Inbox) + Operations + Insights + Business + Account  

### Desktop
- Persistent left sidebar with grouped labels (GYG-style clarity, Traverion identity)  
- Compact top bar: brand context + avatar only  

---

## Visual system direction

- Calm paper surfaces, Finland accent for selected/primary only  
- Operational sans (Plus Jakarta) dominant; Fraunces sparingly for page titles  
- Clear PRIMARY / SECONDARY / TERTIARY / DESTRUCTIVE CTAs  
- Page headers: purpose + one action — no badge soup  
- Dense where operational (tables, calendar); spacious on Today attention  
