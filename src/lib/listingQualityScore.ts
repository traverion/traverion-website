import type { TourPackage } from '../types/tour';
import { TRAVERION_STANDARD_CANCELLATION_POLICY } from '../types/listingExtras';

/** Default image used when none set — replacing it improves trust. */
export const LISTING_PLACEHOLDER_IMAGE =
  'https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg';

/** Minimum main description length to publish (aligned with partner form and publish gate). */
export const MIN_LISTING_DESCRIPTION_LENGTH = 100;

export type ListingQualityCheck = {
  id: string;
  label: string;
  max: number;
  earned: number;
  tip: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Deterministic listing quality score (0–100) from fields suppliers control.
 * Not AI — rules only, easy to tune.
 */
export function computeListingQuality(listing: TourPackage): {
  score: number;
  maxScore: number;
  checks: ListingQualityCheck[];
} {
  const checks: ListingQualityCheck[] = [];

  // Title (9)
  {
    const max = 9;
    const t = listing.title.trim();
    let earned = 0;
    let tip = '';
    if (t.length >= 32) earned = max;
    else if (t.length >= 22) {
      earned = 6;
      tip = 'Add a more specific title (destination, duration, or unique hook).';
    } else if (t.length >= 10) {
      earned = 3;
      tip = 'Title is thin — aim for 32+ characters with clear value.';
    } else {
      tip = 'Add a descriptive title travelers can scan quickly.';
    }
    checks.push({ id: 'title', label: 'Clear title', max, earned, tip });
  }

  // Description (14)
  {
    const max = 14;
    const d = listing.description.trim();
    const len = d.length;
    let earned = 0;
    let tip = '';
    if (len >= 280) earned = max;
    else if (len >= 140) {
      earned = 9;
      tip = 'Expand the description with what’s included, pace, and who it’s for.';
    } else if (len >= MIN_LISTING_DESCRIPTION_LENGTH) {
      earned = 4;
      tip = 'Longer descriptions convert better — target 200+ words where possible.';
    } else if (len >= 60) {
      earned = 2;
      tip = `Reach at least ${MIN_LISTING_DESCRIPTION_LENGTH} characters to publish — add what guests do, what’s included, and practical notes.`;
    } else {
      tip = 'Add a full description: itinerary feel, inclusions, meeting point hints.';
    }
    checks.push({ id: 'description', label: 'Rich description', max, earned, tip });
  }

  // Image (9) — reward replacing generic stock
  {
    const max = 9;
    const img = (listing.image ?? '').trim();
    let earned = 0;
    let tip = '';
    if (!img) {
      tip = 'Add a strong hero image of the experience.';
    } else if (img === LISTING_PLACEHOLDER_IMAGE || img.includes('pexels.com/photos/346885')) {
      earned = 4;
      tip = 'Replace the default stock photo with your own tour imagery.';
    } else {
      earned = max;
    }
    checks.push({ id: 'image', label: 'Hero image', max, earned, tip });
  }

  // Includes (7)
  {
    const max = 7;
    const inc = (listing.includes ?? []).map((s) => s.trim()).filter(Boolean);
    const joined = inc.join(' ').length;
    let earned = 0;
    let tip = '';
    if (inc.length >= 4 && joined >= 50) earned = max;
    else if (inc.length >= 2 && joined >= 24) {
      earned = 6;
      tip = 'List more concrete inclusions (transport, tickets, meals, guide) for full points.';
    } else if (inc.length >= 2) {
      earned = 4;
      tip = 'Flesh out each inclusion with a bit more detail where you can.';
    } else {
      tip = 'Add clear bullet inclusions so guests know what they get.';
    }
    checks.push({ id: 'includes', label: 'Inclusions listed', max, earned, tip });
  }

  // Excludes (3)
  {
    const max = 3;
    const exc = (listing.excludes ?? []).map((s) => s.trim()).filter(Boolean);
    let earned = 0;
    let tip = '';
    if (exc.length >= 2) earned = max;
    else if (exc.length === 1) {
      earned = 2;
      tip = 'Add a second exclusion if relevant (e.g. tips, meals) for full points.';
    } else {
      tip = 'Add exclusions (e.g. tips, personal expenses, entry fees).';
    }
    checks.push({ id: 'excludes', label: 'Exclusions clear', max, earned, tip });
  }

  // Price (7)
  {
    const max = 7;
    const p = listing.price?.startingFrom;
    const earned = typeof p === 'number' && p > 0 ? max : 0;
    checks.push({
      id: 'price',
      label: 'Price set',
      max,
      earned,
      tip: earned < max ? 'Set a valid starting price and currency.' : '',
    });
  }

  // Location (9)
  {
    const max = 9;
    const city = listing.city?.trim();
    const country = listing.country?.trim();
    const dest = listing.destination?.trim();
    let earned = 0;
    let tip = '';
    if (city && country) earned = max;
    else if (country && !city) {
      earned = 4;
      tip = 'Add the main base or starting city (required with country).';
    } else if (city && !country) {
      earned = 4;
      tip = 'Add the country for this experience.';
    } else if (dest && dest.length >= 3) {
      earned = 3;
      tip = 'Add city and country in the structured fields for discovery and trust.';
    } else {
      tip = 'Add city and country — use Logistics for route detail if the experience spans a wider area.';
    }
    checks.push({ id: 'location', label: 'Location details', max, earned, tip });
  }

  // Duration (4)
  {
    const max = 4;
    const d = listing.duration?.trim().toLowerCase() ?? '';
    const ok = d.length >= 2 && !['tbd', 'n/a', '-'].includes(d);
    checks.push({
      id: 'duration',
      label: 'Duration',
      max,
      earned: ok ? max : 0,
      tip: ok ? '' : 'Set a realistic duration (e.g. “3 hours”, “Full day”).',
    });
  }

  // Group size (4)
  {
    const max = 4;
    const g = listing.groupSize?.trim() ?? '';
    const ok = g.length >= 3;
    checks.push({
      id: 'group',
      label: 'Group size',
      max,
      earned: ok ? max : 0,
      tip: ok ? '' : 'Specify typical group size or min/max guests.',
    });
  }

  // Cancellation (9) — Traverion standard terms apply; legacy custom text still scores if present.
  {
    const max = 9;
    const c = listing.cancellationPolicy?.trim() ?? '';
    const usesStandard = c === TRAVERION_STANDARD_CANCELLATION_POLICY;
    const legacyOk = c.length >= 24;
    const pendingDefault = c.length === 0;
    let earned = 0;
    let tip = '';
    if (usesStandard || legacyOk || pendingDefault) earned = max;
    else if (c.length >= 10) {
      earned = 5;
      tip = 'Save the listing to refresh cancellation copy to Traverion’s standard terms, or extend your policy text.';
    } else {
      tip = 'Cancellation follows Traverion’s standard terms; save the listing so guests see the full wording.';
    }
    checks.push({
      id: 'cancellation',
      label: 'Cancellation terms',
      max,
      earned,
      tip,
    });
  }

  // Meeting / pickup (5)
  {
    const max = 5;
    const m = listing.meetingPoint?.trim() ?? '';
    const p = listing.pickupInstructions?.trim() ?? '';
    const len = m.length + p.length;
    let earned = 0;
    let tip = '';
    if (len >= 20) earned = max;
    else if (len >= 8) {
      earned = 3;
      tip = 'Add meeting point or pickup details to reduce day-of confusion.';
    } else {
      tip = 'Guests need where to meet or how pickup works.';
    }
    checks.push({ id: 'meeting', label: 'Meeting / pickup', max, earned, tip });
  }

  // Highlights (5)
  {
    const max = 5;
    const h = (listing.highlights ?? []).map((s) => s.trim()).filter(Boolean);
    let earned = 0;
    let tip = '';
    if (h.length >= 3) earned = max;
    else if (h.length >= 1) {
      earned = 2;
      tip = 'Add 3+ short highlights (unique selling points).';
    } else {
      tip = 'Add bullet highlights so the listing scans well on mobile.';
    }
    checks.push({ id: 'highlights', label: 'Highlights', max, earned, tip });
  }

  // Tags (5)
  {
    const max = 5;
    const tags = listing.tags ?? [];
    const earned = tags.length >= 1 ? max : 0;
    checks.push({
      id: 'tags',
      label: 'Tags',
      max,
      earned,
      tip: earned < max ? 'Add tags (e.g. free cancellation, small group, pickup).' : '',
    });
  }

  // Published (10) — live listings count more toward the 100 total
  {
    const max = 10;
    const pub = listing.status !== 'draft';
    checks.push({
      id: 'published',
      label: 'Published on site',
      max,
      earned: pub ? max : 0,
      tip: pub ? '' : 'Publish when ready so travelers can book on the main site.',
    });
  }

  const score = checks.reduce((s, c) => s + c.earned, 0);
  const maxScore = checks.reduce((s, c) => s + c.max, 0);

  return { score, maxScore, checks };
}

export function listingQualityPercent(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return clamp(Math.round((score / maxScore) * 100), 0, 100);
}

/**
 * Partner portal: percentage reflects content/readiness, not “live on site” or optional polish.
 * Excludes: published (use Publish on My listings), highlights & tags (optional in the editor).
 */
export const LISTING_QUALITY_PARTNER_FOCUS_EXCLUDE_IDS = new Set([
  'published',
  'highlights',
  'tags',
]);

export function computeListingQualityPartnerFocus(listing: TourPackage): {
  score: number;
  maxScore: number;
  checks: ListingQualityCheck[];
} {
  const full = computeListingQuality(listing);
  const checks = full.checks.filter((c) => !LISTING_QUALITY_PARTNER_FOCUS_EXCLUDE_IDS.has(c.id));
  const score = checks.reduce((s, c) => s + c.earned, 0);
  const maxScore = checks.reduce((s, c) => s + c.max, 0);
  return { score, maxScore, checks };
}

export function listingQualityPercentPartnerFocus(listing: TourPackage): number {
  const { score, maxScore } = computeListingQualityPartnerFocus(listing);
  return listingQualityPercent(score, maxScore);
}
