# Traverion platform performance — architecture & baseline

Measured against production Vite build artifacts on 2026-10-21 (local `npm run build`).

## Phase 01 — Architecture map

| Layer | Choice |
| --- | --- |
| App shell | Vite 5 + React 18 SPA (CSR), Tailwind |
| Routing | Custom `history.pushState` / `popstate` (no React Router) |
| Consumer | `App.tsx` page state + lazy route chunks |
| Partner | `SupplierLayout` host-scoped shell; section lazy imports |
| Admin | `AdminGate` on `admin.traverion.com` |
| Auth / DB | Supabase Auth + Postgres RLS |
| APIs | Supabase JS client + Edge Functions (`supabase/functions`) |
| Payments | Stripe via Edge Functions / webhooks |
| Deploy | Vercel static `dist` + SPA rewrites (`vercel.json`) |
| Data libs | No React Query; module-level caches + direct fetches |
| Images | Manual `loading` / `fetchPriority`; listing CDN URLs |

### Data flow (simplified)

```
Browser SPA
  → Supabase Auth session
  → PostgREST (RLS) for listings/bookings/messages
  → Edge Functions for checkout, webhooks, notifications
```

Partner sections remount page modules on navigation but keep sidebar/top chrome in `SupplierLayout`.

### Structural bottlenecks (inspected)

1. **Partner desk refetch** — Dashboard, Bookings, Inbox, Availability, Stay Calendar each call `fetchMyListings` / `fetchBookingsForSupplier` on mount (duplicate network when hopping sections).
2. **Large chunks** — main `index` ~553 KB raw / ~160 KB gzip; `SupplierListingForm` ~441 KB raw / ~123 KB gzip; `TourDetails` ~140 KB raw.
3. **Dead dependency** — `workbox-webpack-plugin` in `package.json` is unused (Vite app; no SW registration).
4. **CSR-only consumer** — SEO via client `setPageMetaWithOg`; first paint waits on JS (acceptable for SPA, but LCP depends on hero image priority — Home already uses `fetchPriority="high"`).
5. **Inbox message prefetch** — up to 80 paid bookings (capped). Previously loaded full thread history per booking just for the last row; now `fetchLatestBookingMessage` (`order desc limit 1`). Index `booking_messages_booking_created_idx` already covers this path.

## Phase 02 — Baseline (production build)

| Asset | Raw | Gzip (approx) |
| --- | ---: | ---: |
| `index-*.js` | 553 KB | 160 KB |
| `SupplierListingForm-*.js` | 441 KB | 123 KB |
| `TourDetails-*.js` | 140 KB | 39 KB |
| `supabase-*.js` | 123 KB | 34 KB |
| `AdminGate-*.js` | 115 KB | 27 KB |
| `SupplierLayout-*.js` | 106 KB | 31 KB |
| `Home-*.js` | 20 KB | — |
| `Packages-*.js` | 19 KB | — |
| `dist/` total | ~18 MB | (includes assets) |

**Not measured in this pass (needs field tooling / RUM):** LCP, INP, CLS on production hosts; API p75; DB EXPLAIN. Tracked as remaining work.

**Dev vs prod:** Vite dev HMR is not representative; use `vite preview` / Vercel for timing.

## Caching policy (Phase 13)

| Data | Strategy |
| --- | --- |
| Public published catalog | 45s module cache + inflight coalesce + invalidate event; `peekPublishedListingsCache` for instant hydrate |
| Partner `fetchMyListings` | Short TTL (~12s) + in-flight dedupe by owner supplier id |
| Partner `fetchBookingsForSupplier` | Short TTL (~8s) + in-flight dedupe; invalidate on status writes |
| Partner desk prefetch | `partner-bookings-desk-prefetch` ~20s for Bookings↔Inbox hops |
| Booking / payment mutations | No optimistic success; authoritative server |
| Inbox list preview | Latest message only (`limit 1`); full thread on open |
| Availability / checkout | Freshness-sensitive; no stale finalize |
| Admin tables | No cross-user cache; bookings server-paginated |
| Financial / refunds | Auth-scoped; no client optimistic success |

## After first optimization pass (same machine, `npm run build`)

| Asset | Before (raw) | After (raw) | Notes |
| --- | ---: | ---: | --- |
| `index-*.js` | 553 KB | 422 KB | React extracted to `react-vendor` |
| `react-vendor-*.js` | — | 139 KB (~45 KB gzip) | Cacheable across routes |
| `index` gzip | ~160 KB | ~118 KB | Measured via `gzip -c` |

**Partner data:** `fetchMyListings` / `fetchBookingsForSupplier` coalesce in-flight requests and reuse results for ~8–12s (invalidated on listing/booking writes).

**Navigation:** Partner sidebar `pointerenter`/`focus` warms section chunks; consumer header warms Stays (Tours already prefetched).

**Deps:** Removed unused `workbox-*` packages.

**Inbox / Dashboard unread (Phase 04):** `fetchLatestBookingMessage` (1 row) instead of full thread. Payload reduction scales with thread length. Cap remains `PARTNER_INBOX_MESSAGE_FETCH_CAP` (80).

## After admin / editor / vitals pass (measured `npm run build`)

| Asset | Before | After | Notes |
| --- | ---: | ---: | --- |
| `AdminGate-*.js` | 115 KB | **25.6 KB** (~7.3 KB gzip) | Panels lazy-loaded per tab |
| `AdminBookingsPanel-*.js` | (in gate) | 29.5 KB | Loaded only on Bookings tab |
| `index-*.js` | 422 KB | 433 KB | +opt-in web-vitals-lite |
| Destination hero | — | `fetchPriority="high"` | LCP candidate |
| `SupplierListingForm-*.js` | 451 KB | **359 KB** (~98 KB gzip) | Crop + StayOnboardingFlow deferred |
| `ListingPhotoCropModal-*.js` | — | 29 KB (~9 KB gzip) | Crop only |
| `StayOnboardingFlow-*.js` | — | 66 KB (~19 KB gzip) | Stay editor only |

**Fonts:** Google Fonts stylesheet loads non-blocking (`media="print" onload`).

**Observability:** `?perf=1` or `localStorage.traverion_perf=1` → `window.__traverionPerf()`. Path-only; no PII.

**Admin bookings:** Already server-paginated via edge function.

**Assets CDN:** `vercel.json` already sets `Cache-Control: public, max-age=31536000, immutable` on `/assets/*`.

## Final verification summary (Phases 01–20)

### Problems discovered

1. Partner desk duplicated listings/bookings fetches on every section mount.
2. Inbox/Dashboard pulled full message histories for list previews / unread counts.
3. AdminGate eagerly bundled every ops panel (~115 KB).
4. Listing editor shipped crop library + stay onboarding on every open (~451 KB).
5. Main bundle mixed React into the app chunk (~553 KB).
6. Unused workbox packages.
7. Destination heroes lacked `fetchPriority="high"`.
8. No lightweight field Web Vitals hook.

### Root causes

SPA without shared query layer → repeated PostgREST calls; eager static imports; over-fetch for previews; no opt-in RUM.

### Changes implemented (commits on `main`)

| Commit | Focus |
| --- | --- |
| `01bd0094` | Fetch coalescing, react-vendor chunk, partner/section prefetch, drop workbox |
| `75220a07` | Inbox/Dashboard latest-message-only prefetch |
| `c24e31c6` | Admin panel lazy-split, destination LCP priority, web-vitals-lite, crop modal split |
| _(follow-up)_ | StayOnboardingFlow lazy-split, non-blocking fonts |

### Before / after (measured build artifacts)

| Metric | Baseline | Latest | Delta |
| --- | ---: | ---: | --- |
| `index` raw | 553 KB | 433 KB | **−22%** |
| `index` gzip | ~160 KB | ~121 KB | **−24%** |
| `AdminGate` raw | 115 KB | 26 KB | **−78%** |
| `SupplierListingForm` raw | 441–451 KB | 359 KB | **−20%+** |
| Inbox preview rows/booking | full thread | 1 | payload ≪ |

Field LCP/INP/CLS: **not claimed** — enable `?perf=1` on production to collect.

### Consumer

- Catalog peek + 45s cache already in `usePublishedSupplierListings`.
- Browse cards: eager first tiles, lazy rest, aspect ratios reserved.
- Destination + Home heroes: high fetch priority.
- Route chunk prefetch for Tours/Stays.
- Non-blocking fonts.

### Partner

- Stable `SupplierLayout` shell + section Suspense fallbacks.
- Desk fetch TTL + inflight + section chunk prefetch on sidebar hover.
- Inbox/Dashboard: latest message only for list/unread.
- Listing form: crop + stay onboarding deferred; tour editors skip stay chunk.

### Admin

- Shell stays; panels load per tab with skeleton fallback.
- Bookings queue already paginated server-side.

### Database / API

- Reused existing `booking_messages_booking_created_idx` for `order desc limit 1`.
- No destructive migrations.
- Optional future: RPC to batch latest messages (1 round-trip vs N).

### Auth / reliability

- Session still server-authoritative (`getSession` + `onAuthStateChange`); traveler/partner gates unchanged.
- Checkout keeps `submitting` / `payInFlightRef` anti double-pay.
- No optimistic payment/booking success.

### Remaining bottlenecks / recommendations

1. Collect production Web Vitals with `?perf=1` after deploy; wire to analytics if desired.
2. DB EXPLAIN on staging for `fetchBookingsForSupplier` / availability RPCs.
3. Optional `latest_booking_messages(uuid[])` RPC to collapse Inbox N requests.
4. Further trim `SupplierListingForm` legacy stay step branches (dead when onboarding path active).
5. Consider SSR/edge for consumer LCP if SEO/first-paint becomes a product priority (architecture change — needs approval).

### Verification

- Vitest: inbox latest-message, admin lazy panels, crop lazy, stay onboarding lazy, web-vitals-lite, inflight-dedupe.
- `npm run build` succeeds; chunk sizes recorded above.
- No payment/booking semantic changes.
