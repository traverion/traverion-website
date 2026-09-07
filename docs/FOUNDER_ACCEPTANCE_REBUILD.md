# Traverion world-class rebuild — founder acceptance

**Date:** 7 September 2026  
**Branch:** `main` (local, not pushed)  
**Tip:** `91a2543` plus this Phase 37 commit  
**Hosts:** traveler `traverion.com` · partner `partner.traverion.com` · staff `admin.traverion.com`

## Verdict

**Accept as a tour marketplace.** Traverion still looks and reads like Traverion: paper `#f6f3ee`, paper-raised `#fffcf8`, ink, finland `#003580`, Plus Jakarta Sans + Fraunces. It is not a copy of Airbnb, Booking, GetYourGuide, or Viator.

The live loop is complete for **tours**:

1. **Discover** — Home search, Places, Tours (`/packages` / `/tours`)
2. **Book** — tour detail → date/guests/option → Stripe Checkout → `/booking-confirmed` → My trips
3. **Operate** — partner Today, listings, calendar, bookings, pickup, reviews, offers
4. **Get paid** — Money / earnings with real payout state (no fake “paid”)

**Not live (honest, not hidden as Tours):** Stays, Experiences, Packages-as-a-category. `/stays` and `/experiences` stay reserved. Stay cannot be created in partner. Experiences is **not** folded into Tours.

**This environment’s catalog was empty.** That is correct: Traverion does not fill Home or Tours with sample listings.

---

## Founder walk (Phase 37)

Walked as a traveler on localhost (`http://localhost:5173/`): Home hero (paper, finland Search, 24h cancel + Stripe trust), Tours (search + When/Guests on phone, Filters sheet, honest empty), destination Finland (same empty language, Browse tours), `/log-in` (paper auth, supplier join-here), `/stays` and `/experiences` (reserved copy + Browse tours). All listed routes returned HTTP 200.

Walked partner surfaces in code and prior sessions: `/login` is partner (not traveler), Today is operational not KPI-theatre, listings create **Tour** only, calendar has a legend and guest/cap/full marks, Money refuses fake success.

Identity check: fonts loaded from `index.html`; `.tv-btn-*`, `.tv-input`, `.tv-sheet-*`, `.tv-page` are the live primitives. Profile chrome leftover gray was removed in this phase.

---

## The 37 phases

### 1. Map every route — **done**

Traveler, partner, auth, legal, booking, and reserved inventory all parse through `src/lib/appRouting.ts`. Legacy SEA brochure URLs rewrite to Tours. `/tour/<uuid>` deep-links to `/packages?tour=`. Staff `/admin` on www is not a public product. Dead brochure pages remain in the repo; they are not the live app.

### 2. Design system — **done**

Primitives live in `src/index.css`: `.tv-btn-primary/secondary/ghost`, `.tv-input`, `.tv-chip`, `.tv-page`, `.tv-sheet-overlay/panel`. Tokens: paper, paper-raised, ink, finland. **Gotcha still true:** `.tv-btn-*` is `inline-flex` and overrides Tailwind `hidden` — hide with a wrapper.

### 3. Motion — **done**

Sheets slide up, cards fade in, presses lift (opt-out `.lux-flat` / `.no-lux-interaction`). `prefers-reduced-motion` disables decorative motion. No competitor bounce language.

### 4. Global navigation — **done**

Traveler primary: **Explore** + **Tours**. Stays / Experiences / Packages are not in the header. Partner uses a product nav (Today, Calendar, Listings, Bookings) with Money, Reviews, Offers, Business, Account in secondary/context — not a 15-link top bar.

### 5. Back + route reliability — **done**

Legal Back returns to the product (`eb7db91`). Sheets close with overlay + Escape (`7bd69f1`). Search query can carry into tour detail. Stripe success normalizes to `/booking-confirmed`. Traveler login is `/log-in`; partner is `/login`; reset is `/set-password`.

### 6. Home — **done**

Hero + search + Places + featured tour (real photo or paper, never a stock stand-in after Phase 33) + catalog or honest empty. Not a generic landing page; also not a fake discovery engine.

### 7. Tours search — **done**

Default is clean: search, date, guests, sort, one Filters control. Extra filters live in a sheet. Date + guests are on the phone bar (Phase 36), not buried.

### 8. Tour cards — **done**

`PublicListingBrowseCard`: photo, title, one from-price, duration, location, real reviews or none, free-cancellation only when true. No double price overlay.

### 9. Tour detail — **done**

Flagship: gallery, duration, reviews-or-none, cancellation, operator legal, sticky booking panel. Mobile sticky CTA is progressive: Pick a date → Check availability → Choose option. Pay via Stripe named in the panel.

### 10. Booking flow — **done**

Trip → Details → Pay. Inputs use `tv-input`. Confirm CTA is **Pay with Stripe · {currency} {total}** when checkout exists; otherwise it refuses to fake a payment. Price comes from `quoteBooking`.

### 11. Trips / account — **done**

My trips (`/bookings`, `/trips`), account, wishlist. Payment-cancelled is honest. Account stats do not invent zeros on fetch failure (Phase 33).

### 12. Partner product — **done as tour OS**

Partner is an operating surface for tours, not an admin template clone. Multi-inventory is architected (Phase 34) but only tours are operable end-to-end.

### 13. Partner Today — **done**

Departures, needs-attention, upcoming, empty with one next action. No vanity KPI wall.

### 14. Listings — **done**

List, publish gates, deactivate/delete sheets, payout notices on paper. Create: Tour live; Stay marked unavailable.

### 15. Tour builder — **done**

Listing form is the tour builder (photos, price, meeting, start style, weekday options). Copy says “How does the tour start?” not a reserved Experiences category.

### 16. Stay creation — **honestly not live**

Stay is in `PARTNER_CREATE_INVENTORY` with `canCreate: false`. No public stay checkout. This is correct.

### 17. Calendar — **done**

Month grid with Open / Guests / Cap / Full legend. Closed days mark `—`. “All listings” cannot edit caps; copy says select a tour.

### 18. Partner bookings — **done**

Bookings list and detail, guest names, listing titles, links from calendar days.

### 19. Money — **done**

Earnings / payouts from backend. Empty and error are human. No fake “you were paid”.

### 20. Reviews — **done**

Traveler: real aggregate or “No reviews yet”. JSON-LD only when `reviewCount > 0`. Partner Reviews is an ops page, not a demo scoreboard.

### 21. Offers / discounts — **done**

Partner offers exist; traveler cards show a discount label only when a real discount applies.

### 22. Business / Account / Settings — **done**

Same paper/ink product as the rest of partner (`d8aa45e`).

### 23. Partner auth + landing — **done**

Partner login, landing, password reset feel like Traverion (`de6dc25`). www `/login` is the partner shortcut; travelers use `/log-in`.

### 24. Legal / static — **done**

About, privacy, terms, cookies, legal notice, sitemap, contact, affiliate, content-creator. About says **tours marketplace**, not a live Experiences category.

### 25. Empty states — **done**

Empty tells what happened and what to do (List your tours / Browse tours / Create a listing). No demo catalog.

### 26. Loading — **done**

Skeletons stay in page layout. No full-page spinner flash as the default.

### 27. Error states — **done**

`userFacingError` + retry/contact. Raw backend strings are not the UI.

### 28. Microinteractions — **done**

Press, sheet, save, option pulse. Motion is physical and short.

### 29. Mobile — **done**

Sheets, thumb-reach, safe-area, sticky booking bar, Tours When/Guests on the first screen.

### 30. Performance — **done**

Route-level lazy load; partner stays out of the traveler bundle; prefetch on intent (`b6f7f14`).

### 31. Accessibility — **done**

Skip link, dialog focus trap, keyboard cards, `aria-*` on booking steps and calendar days (`68c3bbd`).

### 32. Functional integrity — **done**

Live clicks land where they claim: tours, trips, login return (`00ee14c`).

### 33. Backend / frontend truth — **done**

No Pexels hero, no default 4.5, no free cancellation unless policy/tag, no fake account zeros (`1a7db1c`).

### 34. Multi-inventory readiness — **done**

Families: `tour | stay | experience | package`. Live catalog/checkout: **tour** only. `experience_kind` is operator format, not the Experiences category (`0c99cb4`). Quotes reject non-tour families.

### 35. Visual consistency — **done**

Destination, auth, confirmation, partner listing dialogs share paper/ink/`tv-*` (`10c7843`).

### 36. Competitive quality — **done**

Jobs from Airbnb / Booking / Wolt / GYG / Viator (clarity, conversion, calendar, mobile, trust) solved in Traverion-native ways. UI was not copied (`91a2543`).

### 37. Founder acceptance — **this document**

Identity holds. Tour marketplace loop holds. Unfinished categories stay reserved. Rebuild loop stops here.

---

## Marketplace loop (checklist)

| Step | Surface | Honest? |
|------|---------|---------|
| Discover | Home, Tours, destination | Yes — empty if unpublished |
| Choose | Tour detail | Yes — real photos, real reviews or none |
| Pay | Stripe Checkout | Yes — no fake success |
| Confirm | `/booking-confirmed`, My trips | Yes |
| Operate | Partner Today, calendar, bookings | Yes |
| Paid | Money | Yes — backend state only |
| Stays | `/stays` | Reserved |
| Experiences | `/experiences` | Reserved, not merged into Tours |
| Packages category | Catalog copy | Coming; not sold as a second live catalog |

## What is still not world-class (accept anyway)

- **No live listings in this local walk** — cannot click a real PDP here; production depends on published operators (Royal Nordic is dogfood, not a fake catalog).
- **Inbox / team / integrations** are not first-class products yet.
- **Stay builder and stay checkout** are intentionally absent.
- **`tsc` still fails on unused/dead files**; ship gate is `npm test` + `vite build`.
- Some partner form labels still use `text-gray-700` inside the listing builder; they are not a second visual language, but they are not fully tokenized.

## Commits (local ahead of origin, this rebuild)

Phases 32–36 and supporting work sit on `main` locally, including:

- `00ee14c` functional integrity  
- `68c3bbd` accessibility  
- `1a7db1c` backend truth  
- `0c99cb4` multi-inventory  
- `10c7843` visual consistency  
- `91a2543` competitive quality  

Do not push until you ask.

## Stop

Phase 37 is the last rebuild phase. **Do not re-arm the agent loop.**
