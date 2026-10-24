/**
 * Rental Creator screens — focused journey (~19 screens).
 * Legacy screen IDs from the 33-step registry remap via LEGACY_RENTAL_SCREEN_ALIASES.
 */

import type { RentalDetails } from '../types/rental';
import { rentalCategoryConfig } from './rental-categories';
import { rentalOperatingHoursIssue, rentalVariantComplete } from './rental-details';

export const RENTAL_ONBOARDING_SCREENS = [
  {
    id: 'basics-category',
    group: 'Basics',
    part: '1 of 5',
    title: 'What are you renting out?',
    body: 'Choose a category and the closest item type.',
  },
  {
    id: 'basics-location',
    group: 'Basics',
    part: '2 of 5',
    title: 'Where is your rental?',
    body: 'Destination, time zone, and listing language.',
  },
  {
    id: 'basics-title',
    group: 'Basics',
    part: '3 of 5',
    title: 'Name your rental',
    body: 'A clear title and short introduction for search and cards.',
  },
  {
    id: 'basics-description',
    group: 'Basics',
    part: '4 of 5',
    title: 'Describe the rental',
    body: 'Full description plus optional highlights customers can scan.',
  },
  {
    id: 'basics-specs',
    group: 'Basics',
    part: '5 of 5',
    title: 'Shared specifications',
    body: 'Facts that apply to every option. Size differences belong in options.',
  },
  {
    id: 'photos',
    group: 'Photos',
    part: '1 of 1',
    title: 'Add rental photos',
    body: 'The first photo is the cover. Reorder anytime — at least three photos.',
  },
  {
    id: 'pickup-handover',
    group: 'Pickup & return',
    part: '1 of 2',
    title: 'Pickup, return and handover',
    body: 'Where customers collect and return the item, and how handover works.',
  },
  {
    id: 'hours',
    group: 'Pickup & return',
    part: '2 of 2',
    title: 'Pickup and return hours',
    body: 'Days and times when handovers are possible.',
  },
  {
    id: 'options',
    group: 'Rental setup',
    part: '1 of 4',
    title: 'Rental options',
    body: 'Sizes, models, or a single standard option — each with its own stock and price.',
  },
  {
    id: 'duration',
    group: 'Rental setup',
    part: '2 of 4',
    title: 'Rental length',
    body: 'Hourly, daily, or both — plus limits and how a day is counted.',
  },
  {
    id: 'booking-rules',
    group: 'Rental setup',
    part: '3 of 4',
    title: 'Booking notice and preparation',
    body: 'How far ahead customers must book, and time between rentals.',
  },
  {
    id: 'pricing',
    group: 'Rental setup',
    part: '4 of 4',
    title: 'Pricing',
    body: 'Shared rates options inherit. Custom prices stay in each option.',
  },
  {
    id: 'requirements',
    group: 'Guest information',
    part: '1 of 5',
    title: 'Customer requirements',
    body: 'Who can rent and what they need to bring.',
  },
  {
    id: 'inclusions',
    group: 'Guest information',
    part: '2 of 5',
    title: "What's included?",
    body: 'Items provided with the rental at no extra charge.',
  },
  {
    id: 'rules',
    group: 'Guest information',
    part: '3 of 5',
    title: 'Important rental rules',
    body: 'Use, return condition, and late returns.',
  },
  {
    id: 'cancellation',
    group: 'Guest information',
    part: '4 of 5',
    title: 'Cancellation policy',
    body: 'Saved for when rental bookings open — not enforced yet.',
  },
  {
    id: 'deposit-info',
    group: 'Guest information',
    part: '5 of 5',
    title: 'Deposits and insurance',
    body: 'Supplier-managed terms. Traverion does not collect deposits online.',
  },
  {
    id: 'preview',
    group: 'Completion',
    part: '1 of 2',
    title: 'Review your rental listing',
    body: 'A supplier preview of saved data. Bookings stay closed until Rentals launches.',
  },
  {
    id: 'publish',
    group: 'Completion',
    part: '2 of 2',
    title: 'Finish rental setup',
    body: 'Save a finished draft. Your listing stays unpublished.',
  },
] as const;

export type RentalOnboardingScreenId = (typeof RENTAL_ONBOARDING_SCREENS)[number]['id'];

/** Maps retired 33-step screen ids → current screen ids so drafts resume correctly. */
export const LEGACY_RENTAL_SCREEN_ALIASES: Record<string, RentalOnboardingScreenId> = {
  category: 'basics-category',
  'item-type': 'basics-category',
  location: 'basics-location',
  language: 'basics-location',
  title: 'basics-title',
  intro: 'basics-title',
  description: 'basics-description',
  highlights: 'basics-description',
  specs: 'basics-specs',
  gallery: 'photos',
  pickup: 'pickup-handover',
  return: 'pickup-handover',
  collection: 'pickup-handover',
  'duration-mode': 'duration',
  'duration-limits': 'duration',
  'daily-rules': 'duration',
  buffers: 'booking-rules',
  notice: 'booking-rules',
  'availability-summary': 'duration',
  'multi-day': 'pricing',
  'pricing-overrides': 'options',
  earnings: 'pricing',
};

export function rentalScreenIndex(id: string): number {
  const index = RENTAL_ONBOARDING_SCREENS.findIndex((screen) => screen.id === id);
  return index >= 0 ? index : 0;
}

export function resolveRentalScreenId(storedId: string | null | undefined): RentalOnboardingScreenId {
  if (!storedId) return RENTAL_ONBOARDING_SCREENS[0].id;
  if (RENTAL_ONBOARDING_SCREENS.some((s) => s.id === storedId)) {
    return storedId as RentalOnboardingScreenId;
  }
  const aliased = LEGACY_RENTAL_SCREEN_ALIASES[storedId];
  if (aliased) return aliased;
  return RENTAL_ONBOARDING_SCREENS[0].id;
}

export function rentalScreenIndexFromStorage(storedId: string | null): number {
  return rentalScreenIndex(resolveRentalScreenId(storedId));
}

export type RentalOnboardingCheck = {
  title: string;
  subtitle?: string;
  description?: string;
  highlights?: string[];
  galleryCount: number;
  city: string;
  country: string;
  experienceLanguage: string;
  rental: RentalDetails;
};

export function rentalStageBlocker(screenId: RentalOnboardingScreenId, check: RentalOnboardingCheck): string | null {
  const r = check.rental;

  switch (screenId) {
    case 'basics-category': {
      if (!r.category) return 'Choose a rental category to continue.';
      if (r.itemType === 'custom') {
        return (r.customItemType ?? '').trim() ? null : 'Enter a custom item type.';
      }
      return r.itemType ? null : 'Choose an item type.';
    }
    case 'basics-location':
      if (!(check.city || '').trim()) return 'Add a city.';
      if (!(check.country || '').trim()) return 'Add a country.';
      if (!(check.experienceLanguage || '').trim()) return 'Choose a listing language.';
      return null;
    case 'basics-title': {
      if ((check.title || '').trim().length < 8) return 'Use a title of at least 8 characters.';
      if ((r.shortIntro || check.subtitle || '').trim().length < 12) {
        return 'Add a short introduction (at least 12 characters).';
      }
      return null;
    }
    case 'basics-description':
      return (check.description || '').trim().length >= 40
        ? null
        : 'Add a description of at least 40 characters.';
    case 'basics-specs':
      return null;
    case 'photos': {
      if (check.galleryCount < 1) return 'Add at least one photo.';
      if (check.galleryCount < 3) return 'Add at least 3 photos before continuing.';
      return null;
    }
    case 'pickup-handover': {
      if ((r.pickupAddress || '').trim().length < 5) return 'Add a pickup address or meeting place.';
      if (r.returnSameAsPickup === false && (r.returnAddress || '').trim().length < 5) {
        return 'Add a return address, or choose same as pickup.';
      }
      return null;
    }
    case 'hours': {
      const open = (r.operatingDays ?? []).some((d) => d.open);
      if (!open) return 'Open at least one day for pickup and return.';
      return rentalOperatingHoursIssue(r.operatingDays);
    }
    case 'options': {
      const variants = r.variants ?? [];
      if (variants.length < 1) return 'Add at least one rental option.';
      if (!variants.every((v) => v.name.trim() && v.quantity >= 1)) {
        return 'Each option needs a name and at least 1 unit.';
      }
      return null;
    }
    case 'duration': {
      if (!r.durationMode) return 'Choose hourly, daily, or both.';
      const mode = r.durationMode;
      if (mode === 'hourly' || mode === 'both') {
        if (!(r.minDurationHours != null && r.minDurationHours >= 1)) return 'Set a minimum hourly duration.';
        if (!(r.maxDurationHours != null && r.maxDurationHours >= r.minDurationHours)) {
          return 'Maximum hours must be at least the minimum.';
        }
      }
      if (mode === 'daily' || mode === 'both') {
        if (!(r.minDurationDays != null && r.minDurationDays >= 1)) return 'Set a minimum daily duration.';
        if (!(r.maxDurationDays != null && r.maxDurationDays >= r.minDurationDays)) {
          return 'Maximum days must be at least the minimum.';
        }
      }
      return null;
    }
    case 'booking-rules':
      return null;
    case 'pricing': {
      const mode = r.durationMode ?? 'daily';
      const p = r.sharedPricing ?? {};
      if ((mode === 'hourly' || mode === 'both') && !(p.pricePerHourMinor != null && p.pricePerHourMinor > 0)) {
        return 'Set an hourly price.';
      }
      if ((mode === 'daily' || mode === 'both') && !(p.pricePerDayMinor != null && p.pricePerDayMinor > 0)) {
        return 'Set a daily price.';
      }
      return null;
    }
    case 'requirements':
      if (r.category === 'snowmobiles') {
        const license = (r.requirements?.license ?? '').trim();
        if (!license) return 'Describe license or driver requirements for snowmobiles.';
      }
      return null;
    case 'inclusions':
    case 'rules':
    case 'cancellation':
    case 'deposit-info':
    case 'preview':
      return null;
    case 'publish': {
      const issues = rentalPublishBlockers(check);
      return issues[0] ?? null;
    }
    default:
      return null;
  }
}

export function rentalPublishBlockers(check: RentalOnboardingCheck): string[] {
  const out: string[] = [];
  const r = check.rental;
  if (!r.category) out.push('Choose a rental category.');
  if (!r.itemType && !(r.customItemType || '').trim()) out.push('Choose an item type.');
  if (!(check.title || '').trim()) out.push('Add a rental title.');
  if (!(check.description || '').trim() || (check.description || '').trim().length < 40) {
    out.push('Add a fuller description.');
  }
  if (!(check.city || '').trim() || !(check.country || '').trim()) out.push('Add city and country.');
  if (check.galleryCount < 3) out.push('Add at least 3 photos.');
  if (!(r.pickupAddress || '').trim()) out.push('Add pickup location.');
  const variants = r.variants ?? [];
  if (variants.length < 1) out.push('Add at least one rental option.');
  for (const v of variants) {
    if (!rentalVariantComplete(v, r)) {
      out.push(`Finish option “${v.name || 'Untitled'}” (quantity and pricing).`);
    }
  }
  if (!r.durationMode) out.push('Choose rental duration mode.');
  const cfg = rentalCategoryConfig(r.category);
  if (cfg?.id === 'snowmobiles' && !(r.requirements?.license || '').trim()) {
    out.push('Add snowmobile license / driver requirements.');
  }
  return out;
}

export function rentalScreenIndexForPublishLine(line: string): number {
  const text = line.toLowerCase();
  if (/photo|gallery|image/.test(text)) return rentalScreenIndex('photos');
  if (/categor|item type/.test(text)) return rentalScreenIndex('basics-category');
  if (/title|introduction/.test(text)) return rentalScreenIndex('basics-title');
  if (/description/.test(text)) return rentalScreenIndex('basics-description');
  if (/city|country|location|language/.test(text)) return rentalScreenIndex('basics-location');
  if (/pickup|return|handover/.test(text)) return rentalScreenIndex('pickup-handover');
  if (/option|variant|quantity|pricing|price/.test(text)) return rentalScreenIndex('options');
  if (/duration|hourly|daily/.test(text)) return rentalScreenIndex('duration');
  if (/snowmobile|license|requirement/.test(text)) return rentalScreenIndex('requirements');
  return rentalScreenIndex('publish');
}

/** Completion checklist groups for the finish screen. */
export const RENTAL_COMPLETION_GROUPS: {
  id: string;
  label: string;
  screens: RentalOnboardingScreenId[];
}[] = [
  {
    id: 'details',
    label: 'Listing details',
    screens: ['basics-category', 'basics-location', 'basics-title', 'basics-description', 'basics-specs'],
  },
  { id: 'photos', label: 'Photos', screens: ['photos'] },
  { id: 'options', label: 'Rental options', screens: ['options'] },
  { id: 'pricing', label: 'Pricing and duration', screens: ['duration', 'booking-rules', 'pricing'] },
  { id: 'pickup', label: 'Pickup and availability', screens: ['pickup-handover', 'hours'] },
  {
    id: 'guest',
    label: 'Guest information and policies',
    screens: ['requirements', 'inclusions', 'rules', 'cancellation', 'deposit-info'],
  },
];
