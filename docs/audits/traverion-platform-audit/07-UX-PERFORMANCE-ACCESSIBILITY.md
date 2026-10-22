# 07 — UX, Performance & Accessibility

**Scope:** Consistency audit + known measurements. No redesign performed.

---

## Design directions (targets)

| Audience | Direction |
|----------|-----------|
| Consumer | Clean, modern, premium white/navy travel marketplace |
| Supplier | Fast, compact, professional operations software |
| Admin | Dense, clear control center |

---

## Consumer UX consistency

| Area | Assessment |
|------|------------|
| Typography | Plus Jakarta primary; Inter ExtraBold reserved for primary header nav; Fraunces loaded (limited use) |
| Buttons / pills | Shared `tv-btn-*`, lux-flat; some one-off Tailwind |
| Cards / elevation | `--tv-elev-*` tokens; browse cards + dest tiles polished |
| Calendars / search | Shared marketplace components — good consolidation |
| Loading / empty | Skeleton + EmptyState/ErrorState patterns present |
| Motion | Restrained; reduced-motion respected in several CSS blocks |
| Recent polish | Homepage hero/nav/destinations; Tour Details luxury work (prior commits) |

**Inconsistencies (P2/P3):** Account hub lighter than Trips; Cart residual page vs Trips mental model; Blog/Experiences placeholders OK if linked carefully; some cancel links still mention cart.

---

## Supplier UX

| Area | Assessment |
|------|------------|
| IA | Clear Tours vs Stays nav groups (`partnerNav.ts`) |
| Density | High — many tools (pickup, performance, discounts, dual calendars) |
| Risk | First-time supplier overload (P3) |
| Coming Soon | Team invites honest |
| Creator complexity | Tour + stay wizards are large; TS noise historically in schedule workspace |

---

## Admin UX

Dense tabbed shell; appropriate for staff. Wipe/system tabs need careful labeling (P1 ops training).

---

## Accessibility

| Check | Status |
|-------|--------|
| Skip link | Present |
| Aria on search/nav | Partially present |
| Focus rings | Finland outline patterns |
| Full WCAG audit | **NOT DONE** |
| Screen reader E2E | **NOT DONE** |
| MarketplaceBrowseShell a11y tests | Contract tests exist |

---

## Performance

| Metric | This audit |
|--------|------------|
| LCP / INP / CLS | **NOT MEASURED** |
| `npm run build` | Succeeded during recent work (~6–7s local) |
| Bundle | TourDetails / SupplierListingForm among largest chunks (build output) |
| Images | Hero + listing CDN; destination covers listing-backed when possible |
| Prefetch | Route prefetch helpers on nav/search |

**Do not claim performance wins without measurements.** Prior “bottlenecks fixed” claims remain UNVERIFIED unless re-measured.

---

## Mobile

| Surface | Status |
|---------|--------|
| Consumer header menu | Code complete; opened in local audit |
| Home mobile search stack | Present |
| Sticky booking bars | Code + unit tests |
| Partner mobile | NOT VERIFIED |
| Admin mobile | Likely secondary; NOT VERIFIED |

---

## Recommendations (post-audit, not implemented)

1. Measure CWV on www production/preview  
2. Align leftover `/cart` cancel copy to Trips  
3. Consider progressive disclosure on partner home for new suppliers  
4. Keep Inter limited to primary nav to avoid global font sprawl  
