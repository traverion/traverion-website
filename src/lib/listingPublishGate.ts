import type { TourPackage } from '../types/tour';
import {
  getListingBookingOptionDurationIssue,
  materializedBookingOptions,
  resolveOptionTravelerStartInstructions,
} from '../types/listingExtras';
import type { ListingBookingOption } from '../types/listingExtras';
import {
  LISTING_PLACEHOLDER_IMAGE,
  MAX_LISTING_DESCRIPTION_LENGTH,
  MAX_LISTING_TITLE_LENGTH,
  MIN_LISTING_DESCRIPTION_LENGTH,
  MIN_LISTING_TITLE_LENGTH,
} from './listingQualityScore';
import {
  TOUR_EXCLUDE_MAX,
  TOUR_INCLUDE_MAX,
  TOUR_INCLUDE_MIN_REQUIRED,
  TOUR_LINE_ITEM_MAX_LENGTH,
  TOUR_LINE_ITEM_MIN_LENGTH,
  areFilledListingLineItemsValid,
} from './listing-creation-lines';
import { priceCategoryValidationMessages } from './price-categories';
import { experienceTodayIsoForListing } from './booking-quote';
import { parseGroupSizeRange } from './booking-flow';
import { optionScheduleManagementIssues } from './listing-schedule-wizard';
import { accessibilityContradictionMessages } from './listing-information-catalogs';
import { listingPublicTextHasOffPlatformIssues } from './listing-off-platform-text';
import { validateBookingContactPhone } from './listing-booking-contact-phone';
import { stayPublicArrivalNoteBlocker } from './stay-arrival';
import { stayBedCount } from './stay-beds';
import { activeStayOptions } from './stay-options';
import { rentalPublishBlockers } from './rental-onboarding';
import { emptyRentalDetails, normalizeRentalDetails } from './rental-details';
import { listingPersistedPhotoCount } from './listingPhotoGrid';

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
    // Phase 1255: flat options need a departure time (SQL 1254 parity).
    if (!(o.startTime ?? '').trim()) {
      issues.push(`${prefix}Set a start time for this option.`.trim());
    }
  }
  const info = o.optionInfo?.trim() ?? '';
  if (info.length < 8) {
    issues.push(`${prefix}Add a short note about this option (e.g. private, small group, language).`.trim());
  }
  const startIx = resolveOptionTravelerStartInstructions(o);
  if (startIx.length < 8) {
    issues.push(
      `${prefix}Add traveler start instructions (arrive early, wait outside, how to find the guide).`.trim()
    );
  }
  if (usesSchedules) {
    for (const m of optionScheduleManagementIssues(o, todayIso)) {
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
 * Phase 1098: season-end “in the past” uses experience-local today (listing departureTimezone),
 * not the partner’s browser calendar day.
 */
export function getListingPublishBlockers(
  listing: TourPackage,
  todayIso?: string,
  nowMs: number = Date.now()
): string[] {
  const today =
    todayIso ??
    experienceTodayIsoForListing(listing.listingExtras?.departureTimezone, nowMs);
  const out: string[] = [];
  const isStay = listing.listingExtras?.inventoryFamily === 'stay';
  const isRental = listing.listingExtras?.inventoryFamily === 'rental';
  if (isRental) {
    const rental = normalizeRentalDetails(listing.listingExtras?.rental) ?? emptyRentalDetails();
    // Cover is stored on `image`; remaining slots on galleryImageUrls — count both.
    const galleryCount = listingPersistedPhotoCount(listing);
    const creatorBlockers = rentalPublishBlockers({
      title: listing.title ?? '',
      subtitle: listing.subtitle ?? '',
      description: listing.description ?? '',
      city: listing.city ?? '',
      country: listing.country ?? '',
      galleryCount,
      experienceLanguage:
        (listing.listingExtras as { experienceLanguage?: string } | undefined)?.experienceLanguage ??
        'en',
      rental,
    });
    out.push(...creatorBlockers);
    return out;
  }
  const title = listing.title?.trim() ?? '';
  if (title.length < MIN_LISTING_TITLE_LENGTH) {
    out.push(
      `Title is too short — add a clear, specific title (${MIN_LISTING_TITLE_LENGTH}–${MAX_LISTING_TITLE_LENGTH} characters).`
    );
  } else if (title.length > MAX_LISTING_TITLE_LENGTH) {
    out.push(
      `Title is too long — shorten it to ${MAX_LISTING_TITLE_LENGTH} characters or fewer.`
    );
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
  if (desc.length > MAX_LISTING_DESCRIPTION_LENGTH) {
    out.push(
      `Main description must be ${MAX_LISTING_DESCRIPTION_LENGTH.toLocaleString('en-US')} characters or fewer.`
    );
  }
  const bookingOptions = materializedBookingOptions(listing.listingExtras?.bookingOptions);
  const price = listing.price?.startingFrom;
  if (isStay) {
    const stay = listing.listingExtras?.stay;
    if (stay?.accommodationMode === 'multi') {
      out.push(
        'Several room types can be saved as a draft. Booking more than one accommodation is not available yet, so this property cannot be published.'
      );
    }
    const nightly = stay?.nightlyPriceUsd ?? (typeof price === 'number' ? price : 0);
    if (stay?.accommodationMode !== 'multi' && (typeof nightly !== 'number' || nightly <= 0)) {
      out.push('Set a nightly price greater than zero.');
    }
    if (stay?.accommodationMode !== 'multi' && (typeof stay?.maxGuests !== 'number' || stay.maxGuests < 1)) {
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
    if (stay?.exteriorCamera === true) {
      const cameraLocation = (stay.cameraLocation ?? '').trim();
      if (cameraLocation.length < 8) {
        out.push('Say where the exterior camera is so guests know what to expect before booking.');
      }
    }
    if (stay?.accommodationMode !== 'multi' && !(stay?.arrivalMethod ?? '').trim()) {
      out.push('Choose how guests arrive.');
    }
    if (stay?.accommodationMode !== 'multi') {
      const primary = activeStayOptions(stay?.options ?? [])[0];
      const beds =
        (primary ? stayBedCount(primary.bedMix) : 0) ||
        stayBedCount(stay?.bedMix) ||
        (typeof stay?.beds === 'number' ? stay.beds : 0);
      const areasWithBeds = (primary?.sleepingAreas ?? []).filter((area) => area.beds.some((bed) => bed.count > 0)).length;
      if (beds < 1 && areasWithBeds < 1) {
        out.push('Add at least one bed guests can sleep in.');
      }
    }
    const rules = stay?.restrictions;
    if (stay?.accommodationMode !== 'multi' && !(rules?.pets && rules?.smoking && rules?.parties)) {
      out.push('Choose pets, smoking, and parties house preferences.');
    }
    const arrivalNote = (stay?.arrivalNote ?? '').trim();
    if (arrivalNote) {
      if (listingPublicTextHasOffPlatformIssues(arrivalNote)) {
        out.push(
          'The public arrival note cannot ask guests to book or pay outside Traverion (remove links, emails, or off-platform booking requests).'
        );
      }
      const privateLeak = stayPublicArrivalNoteBlocker(arrivalNote);
      if (privateLeak) out.push(privateLeak);
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
    // Phase 1240: legacy no-option tours need a parseable min–max (quote 1228 parity).
    const groupSize = (listing.groupSize ?? '').trim();
    if (bookingOptions.length === 0 && !parseGroupSizeRange(groupSize)) {
      out.push('Set group size as a min–max range (for example 1–8 guests) so travelers can book.');
    }
    const meet = (listing.meetingPoint ?? '').trim().length;
    const pickup = (listing.pickupInstructions ?? '').trim().length;
    if (bookingOptions.length === 0 && meet + pickup < 12) {
      out.push('Add meeting point and/or pickup instructions so guests know where to go.');
    }
    const inc = (listing.includes ?? []).map((s) => String(s).trim()).filter(Boolean);
    const exc = (listing.excludes ?? []).map((s) => String(s).trim()).filter(Boolean);
    if (inc.length < TOUR_INCLUDE_MIN_REQUIRED) {
      out.push(
        `Add at least ${TOUR_INCLUDE_MIN_REQUIRED} “what’s included” items so the offer is clear.`
      );
    } else if (inc.length > TOUR_INCLUDE_MAX) {
      out.push(`A listing can include at most ${TOUR_INCLUDE_MAX} “what’s included” items.`);
    } else if (!areFilledListingLineItemsValid(inc)) {
      out.push(
        `Each inclusion must be ${TOUR_LINE_ITEM_MIN_LENGTH}–${TOUR_LINE_ITEM_MAX_LENGTH} characters.`
      );
    }
    if (exc.length > TOUR_EXCLUDE_MAX) {
      out.push(`A listing can include at most ${TOUR_EXCLUDE_MAX} “not included” items.`);
    } else if (!areFilledListingLineItemsValid(exc)) {
      out.push(
        `Each exclusion must be ${TOUR_LINE_ITEM_MIN_LENGTH}–${TOUR_LINE_ITEM_MAX_LENGTH} characters.`
      );
    }
    if (!listing.experienceStartStyle || listing.experienceStartStyle === 'unspecified') {
      out.push(
        'Add at least one bookable option with meeting point or pickup so we know how guests start.'
      );
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
  if (!isStay) {
    const know = listing.listingExtras?.knowBeforeYouGo ?? '';
    const additional = listing.listingExtras?.additionalInfo ?? '';
    if (listingPublicTextHasOffPlatformIssues(know)) {
      out.push(
        'Know before you go cannot ask guests to book or pay outside Traverion (remove links, emails, or off-platform booking requests).'
      );
    }
    if (listingPublicTextHasOffPlatformIssues(additional)) {
      out.push(
        'Additional information cannot ask guests to book or pay outside Traverion (remove links, emails, or off-platform booking requests).'
      );
    }
    const contradictions = accessibilityContradictionMessages(
      listing.listingExtras?.notSuitableForIds ?? [],
      listing.listingExtras?.accessibilityFeatureIds ?? []
    );
    for (const msg of contradictions) out.push(msg);
    const phone = listing.listingExtras?.bookingContactPhoneE164 ?? '';
    const phoneCheck = validateBookingContactPhone(phone);
    if (!phoneCheck.ok) {
      out.push(phoneCheck.error);
    }
  }
  return out;
}

/**
 * Draft list cards: never say “Ready for travelers” while publish blockers remain.
 */
export function partnerListingDraftPublishSubtitle(
  listing: TourPackage,
  todayIso?: string,
  nowMs?: number
): { blockers: string[]; subtitle: string; readyToPublish: boolean } {
  const blockers = getListingPublishBlockers(listing, todayIso, nowMs);
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
  /** Phase 1268/1272: published listing that fails the publish bar (season, capacity, photos…). */
  liveAttention?: string | null;
}): {
  statusLabel: string;
  draftStateLabel: string | null;
  primaryCta: 'publish' | 'continue' | 'verify' | 'view';
  primaryCtaLabel: string;
  publishDisabledReason: string | null;
} {
  if (args.isLive) {
    if (args.liveAttention) {
      return {
        statusLabel: 'Needs update',
        draftStateLabel: args.liveAttention,
        primaryCta: 'continue',
        primaryCtaLabel: 'Manage listing',
        publishDisabledReason: args.liveAttention,
      };
    }
    return {
      statusLabel: 'Live',
      draftStateLabel: null,
      primaryCta: 'view',
      primaryCtaLabel: 'Manage listing',
      publishDisabledReason: null,
    };
  }
  const listingReady = args.publishBlockers.length === 0;
  if (!listingReady) {
    return {
      statusLabel: 'Draft',
      draftStateLabel: 'Incomplete',
      primaryCta: 'continue',
      primaryCtaLabel: 'Continue editing',
      publishDisabledReason: args.publishBlockers[0] ?? 'This listing still needs required details.',
    };
  }
  if (!args.accountEligible) {
    return {
      statusLabel: 'Draft',
      draftStateLabel: null,
      primaryCta: 'verify',
      primaryCtaLabel: 'Verification required',
      publishDisabledReason:
        'Business and payout verification (IBAN + BIC) must be approved before this listing can go live.',
    };
  }
  return {
    statusLabel: 'Draft',
    draftStateLabel: null,
    primaryCta: 'publish',
    primaryCtaLabel: 'Publish',
    publishDisabledReason: null,
  };
}

/** Layer B: publish blocker links in the supplier wizard must open the step that owns that field. */
export function publishBlockerListingWizardStep(blockerLine: string, isStay: boolean): number {
  const t = blockerLine.toLowerCase();
  if (isStay) {
    if (/several room types|not available yet/.test(t)) return 4;
    if (/photo|image|gallery|cover|hero|placeholder/.test(t)) return 5;
    if (/nightly|check-in time|check-out time/.test(t)) return 4;
    if (/check-in address|arrival address|street/.test(t)) return 7;
    if (/city|country|location|destination/.test(t)) return 0;
    if (/guest|bedroom|bed|space|host/.test(t)) return 4;
    if (/description|highlight/.test(t)) return 2;
    return 1;
  }
  if (/photo|image|gallery|cover|hero|placeholder/.test(t)) return 4;
  if (
    /price|option|nightly|weekday|spot|guest per|meet or are picked|starting date|ending date|how guests start|booking closes|cutoff/.test(
      t
    )
  ) {
    return 3;
  }
  if (
    /accessib|know before|what to bring|requirement|not suitable|booking contact|phone number|spoken language|additional information|conflicts with/.test(
      t
    )
  ) {
    return 2;
  }
  if (/include|exclude|description/.test(t)) return 1;
  if (/city|country|location|destination|meeting|pickup/.test(t)) return 1;
  return 0;
}
