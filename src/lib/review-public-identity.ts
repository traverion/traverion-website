/** Public-facing traveler identity for reviews (never invent names). */

export const ANONYMOUS_REVIEW_GUEST_NAME = 'Anonymous traveler';

export const REVIEW_COMMENT_MAX_CHARS = 500;

export type ReviewIdentityChoice = 'named' | 'anonymous';

export function ratingAdjective(rating: number): string | null {
  switch (rating) {
    case 5:
      return 'Excellent';
    case 4:
      return 'Great';
    case 3:
      return 'Good';
    case 2:
      return 'Fair';
    case 1:
      return 'Poor';
    default:
      return null;
  }
}

/** Public guest label stored on reviews.guest_name. */
export function publicReviewGuestName(params: {
  isAnonymous: boolean;
  displayName: string;
}): string {
  if (params.isAnonymous) return ANONYMOUS_REVIEW_GUEST_NAME;
  const named = params.displayName.trim();
  return named || 'Guest';
}

/** Safe public presentation — prefers is_anonymous over raw guest_name. */
export function displayReviewGuestName(row: {
  guest_name?: string | null;
  is_anonymous?: boolean | null;
}): string {
  if (row.is_anonymous) return ANONYMOUS_REVIEW_GUEST_NAME;
  const name = (row.guest_name ?? '').trim();
  if (!name) return 'Guest';
  if (name.toLowerCase() === ANONYMOUS_REVIEW_GUEST_NAME.toLowerCase()) {
    return ANONYMOUS_REVIEW_GUEST_NAME;
  }
  return name;
}

/**
 * Authorized supplier presentation: prefer the booking customer name.
 * Never invent; fall back to named public guest_name, then "Traveler".
 * Do not use this on public Tour/Stay surfaces.
 */
export function supplierReviewCustomerName(row: {
  is_anonymous?: boolean | null;
  guest_name?: string | null;
  booking_guest_name?: string | null;
}): string {
  const fromBooking = (row.booking_guest_name ?? '').trim();
  if (fromBooking) return fromBooking;
  if (!row.is_anonymous) {
    const named = (row.guest_name ?? '').trim();
    if (named && named.toLowerCase() !== ANONYMOUS_REVIEW_GUEST_NAME.toLowerCase()) {
      return named;
    }
  }
  return 'Traveler';
}

export const SUPPLIER_ANONYMOUS_PUBLIC_NOTE = 'Posted anonymously to the public';

export function reviewIdentityFromRow(row: {
  is_anonymous?: boolean | null;
  guest_name?: string | null;
}): ReviewIdentityChoice {
  if (row.is_anonymous === true) return 'anonymous';
  const name = (row.guest_name ?? '').trim();
  if (name.toLowerCase() === ANONYMOUS_REVIEW_GUEST_NAME.toLowerCase()) return 'anonymous';
  return 'named';
}

/** Clamp new/edited comments for submit. Empty string is allowed (rating-only). */
export function normalizeReviewCommentForSubmit(
  comment: string,
  opts?: { allowExistingOverLimit?: boolean; previousComment?: string }
): { ok: true; comment: string } | { ok: false; error: string } {
  const trimmed = comment.trim();
  const previous = (opts?.previousComment ?? '').trim();
  if (
    opts?.allowExistingOverLimit &&
    trimmed === previous &&
    previous.length > REVIEW_COMMENT_MAX_CHARS
  ) {
    return { ok: true, comment: previous };
  }
  if (trimmed.length > REVIEW_COMMENT_MAX_CHARS) {
    return {
      ok: false,
      error: `Comments can be up to ${REVIEW_COMMENT_MAX_CHARS} characters.`,
    };
  }
  return { ok: true, comment: trimmed };
}
