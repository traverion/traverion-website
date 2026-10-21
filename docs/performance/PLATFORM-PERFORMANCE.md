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
5. **Inbox message prefetch** — up to 80 paid bookings message last-rows (capped; intentional).

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

## Caching policy (Phase 13 draft)

| Data | Strategy |
| --- | --- |
| Public published catalog | Existing 45s module cache + invalidate event |
| Partner `fetchMyListings` | Short TTL (~12s) + in-flight dedupe by owner supplier id |
| Partner `fetchBookingsForSupplier` | Short TTL (~8s) + in-flight dedupe; invalidate on status writes |
| Booking / payment mutations | No optimistic success; authoritative server |
| Inbox threads | Per-booking fetch; drafts in memory map |
| Admin tables | No cross-user cache |

## After first optimization pass (same machine, `npm run build`)

| Asset | Before (raw) | After (raw) | Notes |
| --- | ---: | ---: | --- |
| `index-*.js` | 553 KB | 422 KB | React extracted to `react-vendor` |
| `react-vendor-*.js` | — | 139 KB (~45 KB gzip) | Cacheable across routes |
| `index` gzip | ~160 KB | ~118 KB | Measured via `gzip -c` |
| `SupplierListingForm` | 441 KB | 441 KB | Unchanged (editor weight) |

**Partner data:** `fetchMyListings` / `fetchBookingsForSupplier` now coalesce in-flight requests and reuse results for ~8–12s (invalidated on listing/booking writes). Navigating Dashboard → Bookings → Inbox within the TTL should not re-download the full desk payloads.

**Navigation:** Partner sidebar `pointerenter`/`focus` warms section chunks; consumer header warms Stays (Tours already prefetched).

**Deps:** Removed unused `workbox-*` packages (no service worker registration in this Vite app).

## Remaining (not yet measured / not yet changed)

- Field Web Vitals (LCP/INP/CLS) on production hosts
- DB EXPLAIN for booking list / availability (needs staging access)
- Admin table server-side pagination audit
- Further splitting `SupplierListingForm`
- RUM / lightweight observability

## Changes in this performance track

See git history for commits implementing partner fetch coalescing, section chunk prefetch, and bundle cleanup.
