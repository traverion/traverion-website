import type { TourPackage } from '../types/tour';
import { materializedBookingOptions, TRAVERION_STANDARD_CANCELLATION_POLICY } from '../types/listingExtras';

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

function titleWordCount(title: string): number {
  return title.split(/\s+/).filter(Boolean).length;
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

  // Title (9) — length alone misses strong short hooks (e.g. “Guaranteed Northern Lights”).
  {
    const max = 9;
    const t = listing.title.trim();
    const words = titleWordCount(t);
    const specificEnough =
      t.length >= 32 || (t.length >= 16 && words >= 3) || (t.length >= 22 && words >= 2);
    let earned = 0;
    let tip = '';
    if (specificEnough) earned = max;
    else if (t.length >= 22) {
      earned = 6;
      tip = 'Add a clearer hook or place name so the title stands out in search.';
    } else if (t.length >= 10) {
      earned = 3;
      tip = 'Title is thin — add a few more words (what, where, or why it is special).';
    } else {
      tip = 'Add a descriptive title travelers can scan quickly.';
    }
    checks.push({ id: 'title', label: 'Clear title', max, earned, tip });
  }

  // Description (14) — meeting the publish minimum is already strong; top band rewards extra depth.
  {
    const max = 14;
    const d = listing.description.trim();
    const len = d.length;
    let earned = 0;
    let tip = '';
    if (len >= 260) earned = max;
    else if (len >= 190) {
      earned = 12;
      tip = 'Optional: add a bit more on pace, audience, or practical tips for full marks.';
    } else if (len >= MIN_LISTING_DESCRIPTION_LENGTH) {
      earned = 10;
      tip = 'You meet the publish bar — add detail only where it helps guests decide.';
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
      tip = 'Add a strong hero image of the tour.';
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
    if (
      (inc.length >= 3 && joined >= 36) ||
      (inc.length >= 4 && joined >= 42) ||
      (inc.length >= 2 && joined >= 50)
    )
      earned = max;
    else if (inc.length >= 2 && joined >= 24) {
      earned = 6;
      tip = 'Add one more inclusion or a bit more detail per line for full points.';
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
    if (exc.length >= 2 || (exc.length === 1 && exc[0].length >= 14)) earned = max;
    else if (exc.length === 1) {
      earned = 2;
      tip = 'Add a second exclusion if relevant (e.g. tips, meals), or spell out the first one a bit more.';
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
      tip = 'Add the country for this tour.';
    } else if (dest && dest.length >= 3) {
      earned = 3;
      tip = 'Add city and country in the structured fields for discovery and trust.';
    } else {
      tip = 'Add city and country — use Logistics for route detail if the tour spans a wider area.';
    }
    checks.push({ id: 'location', label: 'Location details', max, earned, tip });
  }

  // Duration (4) — accept compact values (e.g. “3” for hours) and common words without digits.
  {
    const max = 4;
    const raw = listing.duration?.trim() ?? '';
    const d = raw.toLowerCase();
    const junk = new Set(['tbd', 'n/a', '-', 'tbc', 'to be confirmed', '']);
    const onlyDigits = /^\d{1,3}$/.test(raw);
    const compactHours = /^\d{1,3}\s*h(?:ours?)?$/i.test(raw);
    const hasTimeWord = /\b(hour|hours|hr|h\b|day|days|night|nights|minute|minutes|min|week|weeks)\b/i.test(raw);
    const hasDigit = /\d/.test(raw);
    const ok =
      !junk.has(d) &&
      (onlyDigits ||
        compactHours ||
        (hasDigit && hasTimeWord) ||
        (raw.length >= 6 && hasTimeWord));
    checks.push({
      id: 'duration',
      label: 'Duration',
      max,
      earned: ok ? max : 0,
      tip: ok
        ? onlyDigits && raw.length <= 3
          ? 'Optional: add “hours” or “days” so duration is obvious at a glance.'
          : ''
        : 'Set a realistic duration (e.g. “3”, “3 hours”, or “Full day”).',
    });
  }

  // Group size (4)
  {
    const max = 4;
    const opts = materializedBookingOptions(listing.listingExtras?.bookingOptions);
    let ok = false;
    if (opts.length > 0) {
      ok = opts.every((o) => o.maxPersons >= o.minPersons && o.minPersons >= 1);
    } else {
      const g = listing.groupSize?.trim() ?? '';
      ok = g.length >= 3;
    }
    checks.push({
      id: 'group',
      label: 'Group size',
      max,
      earned: ok ? max : 0,
      tip: ok ? '' : 'Set min/max guests per booking option, or a clear group size on the listing.',
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
    const opts = materializedBookingOptions(listing.listingExtras?.bookingOptions);
    let earned = 0;
    let tip = '';
    if (opts.length > 0) {
      const scores = opts.map((o) => {
        const a = o.pickupPlace?.trim().length ?? 0;
        const b = o.optionInfo?.trim().length ?? 0;
        return a + b;
      });
      const worst = scores.length ? Math.min(...scores) : 0;
      if (worst >= 20) earned = max;
      else if (worst >= 8) {
        earned = 3;
        tip = 'Add clearer meeting or pickup notes on each option.';
      } else {
        tip = 'Each option needs where to meet or how pickup works.';
      }
    } else {
      const m = listing.meetingPoint?.trim() ?? '';
      const p = listing.pickupInstructions?.trim() ?? '';
      const len = m.length + p.length;
      if (len >= 20) earned = max;
      else if (len >= 8) {
        earned = 3;
        tip = 'Add meeting point or pickup details to reduce day-of confusion.';
      } else {
        tip = 'Guests need where to meet or how pickup works.';
      }
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
