import type { TourPackage } from '../types/tour';
import { getListingBookingOptionDurationIssue, materializedBookingOptions } from '../types/listingExtras';
import type { ListingBookingOption } from '../types/listingExtras';
import { LISTING_PLACEHOLDER_IMAGE, MIN_LISTING_DESCRIPTION_LENGTH } from './listingQualityScore';
import { priceCategoryValidationMessages } from './price-categories';
import { localYmd } from './local-ymd';
import { optionScheduleManagementIssues } from './listing-schedule-wizard';

function optionPublishIssues(
  o: ListingBookingOption,
  index: number,
  multi: boolean,
  todayIso: string
): string[] {
  const issues: string[] = [];
  const prefix = multi ? `Option ${index + 1}${o.name.trim() ? ` (“${o.name.trim()}”)` : ''}: ` : '';
  if (!o.name.trim()) {
    issues.push(
      `${prefix}Add a name for this bookable option (e.g. hotel pickup or 20:00 departure — not “Adult”).`.trim()
    );
  }
  const usesSchedules = Array.isArray(o.schedules);
  if (!usesSchedules) {
    for (const m of priceCategoryValidationMessages(o)) {
      issues.push(`${prefix}${m}`.trim());
    }
  }
  const durIssue = getListingBookingOptionDurationIssue(o.duration ?? '');
  if (durIssue) issues.push(`${prefix}${durIssue}`.trim());
  const meet = o.pickupPlace?.trim() ?? '';
  if (meet.length < 8) issues.push(`${prefix}Add where guests meet or are picked up for this option.`.trim());
  if (!usesSchedules) {
    if (o.minPersons < 1 || o.maxPersons < o.minPersons) {
      issues.push(`${prefix}Set minimum and maximum guests per booking (max ≥ min).`.trim());
    }
    if (o.maxSpotsPerSlot < 1) issues.push(`${prefix}Set how many spots you offer per start time.`.trim());
  }
  const info = o.optionInfo?.trim() ?? '';
  if (info.length < 8) {
    issues.push(`${prefix}Add a short note about this option (e.g. private, small group, language).`.trim());
  }
  if (usesSchedules) {
    for (const m of optionScheduleManagementIssues(o)) {
      issues.push(`${prefix}${m}`.trim());
    }
  } else {
    const wd = o.weekdays ?? [];
    if (!wd.some(Boolean)) issues.push(`${prefix}Select at least one weekday when this option runs.`.trim());
    const df = o.availabilityDateFrom?.trim() ?? '';
    const dt = o.availabilityDateTo?.trim() ?? '';
    if (dt) {
      if (!df) {
        issues.push(`${prefix}Add a starting date when an ending date is set, or remove the ending date.`.trim());
      } else if (df > dt) {
        issues.push(`${prefix}Ending date must be on or after the starting date.`.trim());
      } else if (dt < todayIso) {
        issues.push(
          `${prefix}The last available date is in the past. Extend the season or travelers cannot pick a date.`.trim()
        );
      }
    }
  }
  return issues;
}

/**
 * Human-readable blockers before publishing a listing. Keeps the bar reasonable for a first tour.
 */
export function getListingPublishBlockers(listing: TourPackage, todayIso?: string): string[] {
  const today = todayIso ?? localYmd();
  const out: string[] = [];
  const isStay = listing.listingExtras?.inventoryFamily === 'stay';
  const title = listing.title?.trim() ?? '';
  if (title.length < 10) {
    out.push('Title is too short — add a clear, specific title (at least 10 characters).');
  }
  const sub = listing.subtitle?.trim() ?? '';
  if (sub.length === 0) {
    out.push('Add a subtitle (short line under the title) so guests quickly understand the offer.');
  } else if (sub.length > 300) {
    out.push('Subtitle must be 300 characters or fewer.');
  }
  const desc = listing.description?.trim() ?? '';
  if (desc.length < MIN_LISTING_DESCRIPTION_LENGTH) {
    out.push(
      `Description is too short — use at least ${MIN_LISTING_DESCRIPTION_LENGTH} characters so guests know what they book.`
    );
  }
  if (desc.length > 2000) {
    out.push('Main description must be 2000 characters or fewer.');
  }
  const bookingOptions = materializedBookingOptions(listing.listingExtras?.bookingOptions);
  const price = listing.price?.startingFrom;
  if (isStay) {
    const stay = listing.listingExtras?.stay;
    const nightly = stay?.nightlyPriceUsd ?? (typeof price === 'number' ? price : 0);
    if (typeof nightly !== 'number' || nightly <= 0) {
      out.push('Set a nightly price greater than zero.');
    }
    if (typeof stay?.maxGuests !== 'number' || stay.maxGuests < 1) {
      out.push('Set how many guests the property can host.');
    }
    const checkIn = (stay?.checkInTime ?? '').trim();
    const checkOut = (stay?.checkOutTime ?? '').trim();
    if (!/^\d{2}:\d{2}$/.test(checkIn)) {
      out.push('Set a check-in time so guests know when they can arrive.');
    }
    if (!/^\d{2}:\d{2}$/.test(checkOut)) {
      out.push('Set a check-out time so guests know when to leave.');
    }
    if (!(stay?.checkInAddress ?? '').trim()) {
      out.push('Add the check-in address guests need after they book (street / building / entry).');
    }
  } else if (bookingOptions.length > 0) {
    for (let i = 0; i < bookingOptions.length; i++) {
      out.push(...optionPublishIssues(bookingOptions[i], i, bookingOptions.length > 1, today));
    }
  } else if (typeof price !== 'number' || price <= 0) {
    out.push('Set a starting price greater than zero.');
  }
  const img = (listing.image ?? '').trim();
  const heroIsPlaceholder =
    !img || img === LISTING_PLACEHOLDER_IMAGE || img.includes('pexels.com/photos/346885');
  if (heroIsPlaceholder) {
    out.push(
      isStay
        ? 'Replace the placeholder hero image with a real photo of the property.'
        : 'Replace the placeholder hero image with a real photo of your tour.'
    );
  }
  const city = listing.city?.trim();
  const country = listing.country?.trim();
  if (!city || !country) {
    out.push('Add both city and country so the listing can be discovered and trusted.');
  }
  if (!isStay) {
    const groupSize = (listing.groupSize ?? '').trim();
    if (bookingOptions.length === 0 && groupSize.length < 3) {
      out.push('Set group size (for example min–max guests or “up to X”) so guests know what to expect.');
    }
    const meet = (listing.meetingPoint ?? '').trim().length;
    const pickup = (listing.pickupInstructions ?? '').trim().length;
    if (bookingOptions.length === 0 && meet + pickup < 12) {
      out.push('Add meeting point and/or pickup instructions so guests know where to go.');
    }
    const inc = (listing.includes ?? []).map((s) => String(s).trim()).filter(Boolean);
    const exc = (listing.excludes ?? []).map((s) => String(s).trim()).filter(Boolean);
    if (inc.length < 2) {
      out.push('Add at least two “what’s included” items so the offer is clear.');
    }
    if (exc.length < 1) {
      out.push('Add at least one “not included” item (for example meals or tickets) to set expectations.');
    }
  }
  const gallery = (listing.listingExtras?.galleryImageUrls ?? []).map((u) => String(u).trim()).filter(Boolean);
  if (!heroIsPlaceholder && gallery.length < 3) {
    out.push(
      'Add at least three more photos after the main image (four photos minimum total, in the order travelers should see them).'
    );
  }
  if (!heroIsPlaceholder && gallery.length > 11) {
    out.push('A listing can include at most twelve photos in total (one main plus up to eleven more).');
  }
  return out;
}

/**
 * Draft list cards: never say “Ready for travelers” while publish blockers remain.
 */
export function partnerListingDraftPublishSubtitle(
  listing: TourPackage,
  todayIso?: string
): { blockers: string[]; subtitle: string; readyToPublish: boolean } {
  const blockers = getListingPublishBlockers(listing, todayIso);
  if (blockers.length === 0) {
    return { blockers, subtitle: 'Ready for travelers', readyToPublish: true };
  }
  const n = blockers.length;
  const first = blockers[0] ?? 'Finish required fields';
  return {
    blockers,
    subtitle: `${n} before publish · ${first}`,
    readyToPublish: false,
  };
}

export function partnerListingCardPresentation(args: {
  isLive: boolean;
  publishBlockers: string[];
  accountEligible: boolean;
}): {
  statusLabel: string;
  draftStateLabel: string | null;
  primaryCta: 'publish' | 'continue' | 'verify' | 'view';
  primaryCtaLabel: string;
  publishDisabledReason: string | null;
} {
  if (args.isLive) {
    return {
      statusLabel: 'Live',
      draftStateLabel: null,
      primaryCta: 'view',
      primaryCtaLabel: 'View',
      publishDisabledReason: null,
    };
  }
  const listingReady = args.publishBlockers.length === 0;
  if (!listingReady) {
    return {
      statusLabel: 'Draft',
      draftStateLabel: 'Incomplete',
      primaryCta: 'continue',
      primaryCtaLabel: 'Edit',
      publishDisabledReason: args.publishBlockers[0] ?? 'This listing still needs required details.',
    };
  }
  if (!args.accountEligible) {
    return {
      statusLabel: 'Draft',
      draftStateLabel: 'Ready to publish',
      primaryCta: 'verify',
      primaryCtaLabel: 'Verification required',
      publishDisabledReason:
        'Business and payout verification (IBAN + BIC) must be approved before this listing can go live.',
    };
  }
  return {
    statusLabel: 'Draft',
    draftStateLabel: 'Ready to publish',
    primaryCta: 'publish',
    primaryCtaLabel: 'Publish',
    publishDisabledReason: null,
  };
}
