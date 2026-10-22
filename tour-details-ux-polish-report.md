# Tour Details — premium UX & booking refinement

## Completed phases

| Phases | Status |
|--------|--------|
| 01 Audit | Done |
| 02–05 Layout, title, gallery, facts | Done |
| 06–08 Options header + cards + selected state | Done |
| 09–10 Pricing audit + discount presentation | Done (critical fix) |
| 11–16 Sticky panel, restored notice, controls, CTA, scroll containment | Done |
| 17–26 Content sections, reviews empty, operator, bottom transition | Done |
| 27–29 Motion/responsive | Partial — desktop smoke verified; not every breakpoint |
| 30 Functional verification | Partial — option select + price parity verified in browser; checkout not re-run end-to-end |

## Pricing investigation (Phase 09)

**Root cause:** Option cards used catalog “From” = cheapest age-category unit (often child) after discount. Sticky panel used `quoteBooking` for the live adult mix → e.g. cards ~€74.76 / €66.36 vs sticky €99.96 for 1 adult.

**Fix:** `optionCardPriceForSelection` quotes each option with the traveler’s current party via `quoteBooking`, remapping mix by category kind across options (`remapMixToOption`). Fallback “From / adult” uses `optionHeadlineUnitPrice` (adult headline), never child min.

**Verified live:** Bus €83.16 and Small group €99.96 for 1 adult; sticky matches selected option (€99.96 Per adult).

## Visual improvements

- Compact option cards with border-selected state (no heavy blue fill)
- Calmer discount badges (terracotta, not loud red body text)
- Compact dismissible restored-selection notice
- Tighter facts, overview measure, cancellation surface, reviews empty, operator reading width
- PDP column tokens (`.tv-pdp-layout` / `.tv-pdp-main` / `.tv-pdp-below`)

## Tests

- `tour-option-card-price.test.ts` (selection totals, cross-option remap, hide)
- Updated honesty source tests
- Production build: see commit notes

## Browser evidence

Local Vite: tour PDP — date → options → select small group → sticky €99.96 aligned with card.

## Remaining

- Full mobile/tablet matrix screenshots
- End-to-end Stripe checkout re-verification after this polish
- Exhaustive multi-category / sold-out edge matrix beyond unit tests

## Commits

- `035883f6` — Tour Details UX + selection-aligned option pricing.
