/**
 * Partner listing builder — section completeness for guided create/edit (tour).
 * Maps to human concepts, not DB field names.
 */

import type { ListingBookingOption } from '../types/listingExtras';
import { getListingBookingOptionDurationIssue, materializedBookingOptions } from '../types/listingExtras';
import { priceCategoryValidationMessages } from './price-categories';
import {
  isPlaceholderListingImageUrl,
  LISTING_PHOTO_MIN,
  orderedPhotoUrls,
  normalizePhotoSlots,
} from './listingPhotoGrid';
import { MIN_LISTING_DESCRIPTION_LENGTH } from './listingQualityScore';

export type ListingBuilderSectionId =
  | 'basics'
  | 'content'
  | 'location'
  | 'options'
  | 'photos';

export type ListingBuilderSectionStatus = 'complete' | 'incomplete' | 'empty';

export type ListingBuilderSection = {
  id: ListingBuilderSectionId;
  label: string;
  status: ListingBuilderSectionStatus;
  issues: string[];
};

type BuilderFormSlice = {
  inventoryFamily?: string;
  experienceLanguage?: string;
  experienceKind?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  highlights?: string[];
  includes?: string[];
  excludes?: string[];
  city?: string;
  country?: string;
  duration?: string;
  typicalTimelineNotes?: string;
  bookingOptions?: ListingBookingOption[];
  photoSlots?: string[];
};

function optionIssues(o: ListingBookingOption, multi: boolean, index: number): string[] {
  const prefix = multi ? `Option ${index + 1}: ` : '';
  const out: string[] = [];
  if (!o.name.trim()) out.push(`${prefix}Add an option name`.trim());
  out.push(...priceCategoryValidationMessages(o).map((m) => `${prefix}${m}`.trim()));
  const dur = getListingBookingOptionDurationIssue(o.duration ?? '');
  if (dur) out.push(`${prefix}${dur}`.trim());
  if ((o.pickupPlace?.trim() ?? '').length < 8) out.push(`${prefix}Add meeting or pickup place`.trim());
  if (!o.weekdays?.some(Boolean)) out.push(`${prefix}Choose weekdays`.trim());
  return out;
}

export function listingBuilderSections(form: BuilderFormSlice): ListingBuilderSection[] {
  const isStay = form.inventoryFamily === 'stay';
  if (isStay) {
    return [];
  }

  const title = (form.title ?? '').trim();
  const sub = (form.subtitle ?? '').trim();
  const lang = (form.experienceLanguage ?? '').trim();
  const kind = form.experienceKind ?? '';
  const kindOk = kind === 'tour' || kind === 'ticket' || kind === 'transportation';
  const basicsIssues: string[] = [];
  if (!lang) basicsIssues.push('Choose the main language');
  if (!kindOk) basicsIssues.push('Choose the activity type');
  if (title.length < 10) basicsIssues.push('Add a clear title (at least 10 characters)');
  if (!sub) basicsIssues.push('Add a subtitle');

  const desc = (form.description ?? '').trim();
  const highlights = (form.highlights ?? []).map((s) => s.trim()).filter(Boolean);
  const includes = (form.includes ?? []).map((s) => s.trim()).filter(Boolean);
  const excludes = (form.excludes ?? []).map((s) => s.trim()).filter(Boolean);
  const contentIssues: string[] = [];
  if (desc.length < MIN_LISTING_DESCRIPTION_LENGTH) {
    contentIssues.push(`Description needs at least ${MIN_LISTING_DESCRIPTION_LENGTH} characters`);
  }
  if (highlights.length < 1) contentIssues.push('Add at least one highlight');
  if (includes.length < 2) contentIssues.push('Add at least two included items');
  if (excludes.length < 1) contentIssues.push('Add at least one not-included item');

  const city = (form.city ?? '').trim();
  const country = (form.country ?? '').trim();
  const duration = (form.duration ?? '').trim();
  const locationIssues: string[] = [];
  if (!city || !country) locationIssues.push('Add city and country');
  if (!duration) locationIssues.push('Add how long the experience lasts');

  const opts = materializedBookingOptions(form.bookingOptions);
  const optionsIssues: string[] = [];
  if (opts.length === 0) optionsIssues.push('Add at least one bookable option');
  else {
    opts.forEach((o, i) => optionsIssues.push(...optionIssues(o, opts.length > 1, i)));
  }

  const ordered = orderedPhotoUrls(normalizePhotoSlots(form.photoSlots ?? []));
  const photosIssues: string[] = [];
  if (ordered.length < LISTING_PHOTO_MIN) {
    photosIssues.push(`Add at least ${LISTING_PHOTO_MIN} photos`);
  } else if (isPlaceholderListingImageUrl(ordered[0] ?? '')) {
    photosIssues.push('Replace the placeholder cover photo');
  }

  const statusOf = (issues: string[], touched: boolean): ListingBuilderSectionStatus => {
    if (issues.length === 0) return 'complete';
    if (!touched) return 'empty';
    return 'incomplete';
  };

  return [
    {
      id: 'basics',
      label: 'Basics',
      status: statusOf(basicsIssues, Boolean(title || sub || lang || kind)),
      issues: basicsIssues,
    },
    {
      id: 'content',
      label: 'Content',
      status: statusOf(contentIssues, Boolean(desc || highlights.length || includes.length)),
      issues: contentIssues,
    },
    {
      id: 'location',
      label: 'Location',
      status: statusOf(locationIssues, Boolean(city || country || duration)),
      issues: locationIssues,
    },
    {
      id: 'options',
      label: 'Options & pricing',
      status: statusOf(optionsIssues, opts.length > 0),
      issues: optionsIssues,
    },
    {
      id: 'photos',
      label: 'Photos',
      status: statusOf(photosIssues, ordered.length > 0),
      issues: photosIssues,
    },
  ];
}

export function listingBuilderReadyToPublish(form: BuilderFormSlice): boolean {
  return listingBuilderSections(form).every((s) => s.status === 'complete');
}
