/**
 * Consumer experience measure — Phase 01 audit, consumed by later layout work.
 *
 * Audit (consumer routes only; supplier portal stays on its own shell):
 * - Homepage, Explore, Tours, Stays, destination, tour PDP, stay PDP, checkout,
 *   confirmation, Trips, Saved, account, auth, legal, contact, nav, footer.
 * - Canvas is warm beige (#f6f3ee) with warm raised cards (#fffcf8). Pages do not
 *   share one white surface system.
 * - Tour and stay detail use max-w-[90rem], so copy and the booking column stretch
 *   on wide screens. Catalogs are closer to max-w-6xl / max-w-7xl.
 * - Tour PDP leads with the gallery, then the title. The booking card is first on
 *   mobile (order-1) and only loosely sticky on desktop (lg:top-24, no max-height).
 * - Option prices for age categories render as one run-on string
 *   ("Adult €119 · Adult €99 · Child €89").
 * - "Good to know" is an unstructured bullet list (Difficulty, languages, bring).
 * - In-app navigation mostly replaceState's. Opening a tour from a page whose URL
 *   was never updated (notably Tours) makes Back land on the wrong history entry.
 * - Main column animations that keep a transform trap position:sticky and the
 *   fixed mobile booking bar.
 * - Listing cards, auth, trips, and stays already share tv-btn / tv-card primitives
 *   but still sit on the beige canvas.
 */

/** Readable consumer column. Catalog grids may use the wide measure. */
export const CONSUMER_CONTENT_MAX = '72rem';
/** Tour and stay detail: gallery + reading column + booking sidebar. */
export const CONSUMER_PDP_MAX = '76rem';
/** Desktop booking sidebar width. */
export const CONSUMER_BOOKING_COL = '22.5rem';
/** Sticky header content height (h-14) plus a small gap. */
export const CONSUMER_HEADER_OFFSET = '4.75rem';

export const CONSUMER_PAPER = '#ffffff';
export const CONSUMER_INK = '#1c1917';
export const CONSUMER_FINLAND = '#003580';
