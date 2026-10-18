# Stay creator completion baseline

Recorded at `d83251d9` on `main`. This is the starting point for the premium completion pass. It does not claim new product behavior.

## Screens

The journey is `STAY_ONBOARDING_SCREENS` in `src/lib/stay-onboarding.ts`, rendered by `StayOnboardingFlow`.

1. location
2. confirm
3. property-type
4. property-name
5. amenities
6. rooms
7. description
8. highlights
9. booking-method
10. booking-times
11. booking-cutoff
12. availability
13. guests
14. stay-length
15. price
16. fees
17. arrival-method
18. arrival-notes
19. photos
20. room-photos
21. cancellation
22. house-rules
23. quiet-hours
24. safety
25. preview
26. publish

Screen id is stored in `sessionStorage` as `traverion-stay-onboarding-screen-v2-${editingId ?? 'create'}`. Listing fields persist through the supplier listing form and the existing stay option projection.

## What already works

- One bookable option writes property type onto the option, so a Villa is not overwritten by an older House option.
- Street address, private pin, and public city are separate. Public JSON strips the street, unit, postal code, and pin.
- Booking notice is two menus and is stored as `cutoffMinutes`.
- Nightly earnings use the active commercial agreement when one is loaded. No percentage is hardcoded.
- Cleaning is a per-stay amount. Extras keep their stored charge frequency.
- Preview shows saved public facts and hides the street address. Edit returns to the preview.
- New drafts use Publish property. Published listings use Save changes.
- Photos use `ListingImageFields` and the existing upload pipeline. Room photos use `StayBedroomPhotos` and `roomPhotos` on the option.

## What is still missing

- Selectable screens still use one-off ring classes instead of the shared `lc-choice` treatment.
- Property types, beds, amenities, arrival methods, highlights, and safety have no consistent icons.
- Amenities open in a dropdown. The presets are not shown as a scannable grouped grid.
- Bedroom cards do not lead with a natural sleep summary.
- Highlights are confirmed only by pressing Enter, with no separate confirmed list.
- The photo grid is the shared listing uploader. It is functional and still visually basic for a property gallery.
- Room photos are assigned from a text dropdown (`Main photo 1`).
- Preview and publish are structured summaries, not a guest-page layout or a grouped completion screen.
- No signed-in browser walkthrough has been recorded.

## Tests and typecheck

Stay unit tests live beside `src/lib/stay-*.ts`, `src/types/listingExtras.privacy.test.ts`, and `src/lib/stay-form-check-times.test.ts`.

`tsc --noEmit -p tsconfig.app.json` already fails outside this creator: `TourScheduleWorkspace.tsx` ref type, `className` on supplier notices, and unused `defaultExcludes` in `src/data/supabase-listings.ts`.

## Working tree left untouched

`public/sitemap.xml` is modified. `.cursor/` and `Marketing & brand/` are untracked. Those files are not part of this creator.
