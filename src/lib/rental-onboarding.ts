/**
 * Rental Creator screens — focused journey (~19 screens).
 * Legacy screen IDs from the 33-step registry remap via LEGACY_RENTAL_SCREEN_ALIASES.
 */

import type { RentalDetails } from '../types/rental';
import { rentalCategoryConfig } from './rental-categories';
import { isRentalCancellationPreset } from './rental-cancellation';
import { rentalOperatingHoursIssue, rentalVariantComplete } from './rental-details';

export const RENTAL_ONBOARDING_SCREENS = [
  {
    id: 'basics-category',
    group: 'Basics',
    part: '1 of 7',
    title: 'What are you renting out?',
    body: 'Choose the category that matches the product. Item type is the next step.',
  },
  {
    id: 'basics-item',
    group: 'Basics',
    part: '2 of 7',
    title: 'Which item type is it?',
    body: 'Pick the closest type. Use “Something else” when none of the names fit.',
  },
  {
    id: 'basics-location',
    group: 'Basics',
    part: '3 of 7',
    title: 'Where is your rental?',
    body: 'Destination, time zone, and the language you write the listing in.',
  },
  {
    id: 'basics-title',
    group: 'Basics',
    part: '4 of 7',
    title: 'Name your rental',
    body: 'A clear title and a short introduction for search and cards.',
  },
  {
    id: 'basics-description',
    group: 'Basics',
    part: '5 of 7',
    title: 'Describe the rental',
    body: 'The full description customers read on the listing.',
  },
  {
    id: 'basics-highlights',
    group: 'Basics',
    part: '6 of 7',
    title: 'Highlights',
    body: 'Short points customers can scan. Only highlights you add are saved.',
  },
  {
    id: 'basics-specs',
    group: 'Basics',
    part: '7 of 7',
    title: 'Shared specifications',
    body: 'Facts that apply to every option. Sizes and models that differ belong in options.',
  },
  {
    id: 'photos',
    group: 'Photos',
    part: '1 of 1',
    title: 'Add rental photos',
    body: 'The first photo is the cover. Reorder anytime. At least three photos.',
  },
  {
    id: 'pickup-location',
    group: 'Pickup & return',
    part: '1 of 4',
    title: 'Where do customers collect it?',
    body: 'The pickup address or meeting place.',
  },
  {
    id: 'return-location',
    group: 'Pickup & return',
    part: '2 of 4',
    title: 'Where do they return it?',
    body: 'Same place as pickup, or a different return point.',
  },
  {
    id: 'hours',
    group: 'Pickup & return',
    part: '3 of 4',
    title: 'Pickup and return hours',
    body: 'Choose the open days, then set one pickup window and one return window.',
  },
  {
    id: 'handover',
    group: 'Pickup & return',
    part: '4 of 4',
    title: 'How does handover work?',
    body: 'Staff or self-service, ID at pickup, and any practical instructions.',
  },
  {
    id: 'options',
    group: 'Rental options',
    part: '1 of 1',
    title: 'Rental options',
    body: 'A listing can have one standard option or several sizes and models. Each option keeps its own stock.',
  },
  {
    id: 'duration',
    group: 'Availability & duration',
    part: '1 of 3',
    title: 'How long can it be rented?',
    body: 'Hourly, daily, or both, and the shortest and longest rental you accept.',
  },
  {
    id: 'daily-counting',
    group: 'Availability & duration',
    part: '2 of 3',
    title: 'How is a day counted?',
    body: 'Calendar days use your pickup and return hours. This is separate from preparation time.',
  },
  {
    id: 'booking-rules',
    group: 'Availability & duration',
    part: '3 of 3',
    title: 'Notice and preparation',
    body: 'Notice is how far ahead a customer must book. Preparation is the buffer between two rentals.',
  },
  {
    id: 'pricing',
    group: 'Pricing',
    part: '1 of 1',
    title: 'Standard price',
    body: 'The rate every option uses, unless that option has its own price.',
  },
  {
    id: 'requirements',
    group: 'Guest information',
    part: '1 of 8',
    title: 'Customer requirements',
    body: 'Age, identification, licence, and experience. One place for each.',
  },
  {
    id: 'accessibility',
    group: 'Guest information',
    part: '2 of 8',
    title: 'Accessibility',
    body: 'Access at the pickup place. This is not the same as how demanding the product is.',
  },
  {
    id: 'suitability',
    group: 'Guest information',
    part: '3 of 8',
    title: 'Suitability',
    body: 'Difficulty, skill, and who the rental is for or not for. Say each thing once.',
  },
  {
    id: 'inclusions',
    group: 'Guest information',
    part: '4 of 8',
    title: "What's included?",
    body: 'Items provided with the rental at no extra charge.',
  },
  {
    id: 'restrictions',
    group: 'Guest information',
    part: '5 of 8',
    title: 'Restrictions',
    body: 'Uses you do not allow. Customers see these before booking opens.',
  },
  {
    id: 'rules',
    group: 'Guest information',
    part: '6 of 8',
    title: 'Rental rules',
    body: 'Permitted use, return condition, cleaning, damage, and late returns.',
  },
  {
    id: 'cancellation',
    group: 'Guest information',
    part: '7 of 8',
    title: 'Cancellation policy',
    body: 'The window customers may request cancellation. Traverion does not issue automatic rental refunds.',
  },
  {
    id: 'deposit-info',
    group: 'Guest information',
    part: '8 of 8',
    title: 'Deposits and insurance',
    body: 'Terms you manage yourself. Traverion does not collect deposits or handle insurance claims.',
  },
  {
    id: 'preview',
    group: 'Completion',
    part: '1 of 2',
    title: 'Review your rental listing',
    body: 'A supplier preview of saved data. This is not a live bookable listing.',
  },
  {
    id: 'publish',
    group: 'Completion',
    part: '2 of 2',
    title: 'Finish rental setup',
    body: 'Save a finished draft. The listing stays unpublished and payment stays closed.',
  },
] as const;

export type RentalOnboardingScreenId = (typeof RENTAL_ONBOARDING_SCREENS)[number]['id'];

/** Maps retired 33-step screen ids → current screen ids so drafts resume correctly. */
export const LEGACY_RENTAL_SCREEN_ALIASES: Record<string, RentalOnboardingScreenId> = {
  category: 'basics-category',
  'item-type': 'basics-item',
  location: 'basics-location',
  language: 'basics-location',
  title: 'basics-title',
  intro: 'basics-title',
  description: 'basics-description',
  highlights: 'basics-highlights',
  specs: 'basics-specs',
  gallery: 'photos',
  'pickup-handover': 'pickup-location',
  pickup: 'pickup-location',
  return: 'return-location',
  collection: 'handover',
  'duration-mode': 'duration',
  'duration-limits': 'duration',
  'daily-rules': 'daily-counting',
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
    case 'basics-category':
      return r.category ? null : 'Choose a rental category to continue.';
    case 'basics-item': {
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
    case 'basics-highlights':
    case 'basics-specs':
      return null;
    case 'photos': {
      if (check.galleryCount < 1) return 'Add at least one photo.';
      if (check.galleryCount < 3) return 'Add at least 3 photos before continuing.';
      return null;
    }
    case 'pickup-location':
      return (r.pickupAddress || '').trim().length < 5 ? 'Add a pickup address or meeting place.' : null;
    case 'return-location':
      if (r.returnSameAsPickup === false && (r.returnAddress || '').trim().length < 5) {
        return 'Add a return address, or choose same as pickup.';
      }
      return null;
    case 'handover':
    case 'daily-counting':
    case 'accessibility':
    case 'suitability':
    case 'restrictions':
      return null;
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
      if (r.category === 'snowmobiles' || r.category === 'vehicles') {
        const license = (r.requirements?.license ?? '').trim();
        if (!license) return 'Describe the licence or driver requirements.';
      }
      return null;
    case 'cancellation':
      return isRentalCancellationPreset(r.cancellationPreset)
        ? null
        : 'Choose a cancellation policy.';
    case 'inclusions':
    case 'rules':
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
  if ((cfg?.id === 'snowmobiles' || cfg?.id === 'vehicles') && !(r.requirements?.license || '').trim()) {
    out.push('Add licence or driver requirements.');
  }
  if (!isRentalCancellationPreset(r.cancellationPreset)) out.push('Choose a cancellation policy.');
  return out;
}

export function rentalScreenIndexForPublishLine(line: string): number {
  const text = line.toLowerCase();
  if (/photo|gallery|image/.test(text)) return rentalScreenIndex('photos');
  if (/item type/.test(text)) return rentalScreenIndex('basics-item');
  if (/categor/.test(text)) return rentalScreenIndex('basics-category');
  if (/title|introduction/.test(text)) return rentalScreenIndex('basics-title');
  if (/highlight/.test(text)) return rentalScreenIndex('basics-highlights');
  if (/description/.test(text)) return rentalScreenIndex('basics-description');
  if (/city|country|location|language/.test(text)) return rentalScreenIndex('basics-location');
  if (/handover|hours/.test(text)) return rentalScreenIndex('handover');
  if (/return address|return location/.test(text)) return rentalScreenIndex('return-location');
  if (/pickup|return/.test(text)) return rentalScreenIndex('pickup-location');
  if (/option|variant|quantity|pricing|price/.test(text)) return rentalScreenIndex('options');
  if (/duration|hourly|daily/.test(text)) return rentalScreenIndex('duration');
  if (/snowmobile|license|requirement/.test(text)) return rentalScreenIndex('requirements');
  if (/cancellation|policy/.test(text)) return rentalScreenIndex('cancellation');
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
    screens: ['basics-category', 'basics-item', 'basics-location', 'basics-title', 'basics-description', 'basics-highlights', 'basics-specs'],
  },
  { id: 'photos', label: 'Photos', screens: ['photos'] },
  { id: 'options', label: 'Rental options', screens: ['options'] },
  { id: 'pricing', label: 'Pricing and duration', screens: ['duration', 'daily-counting', 'booking-rules', 'pricing'] },
  { id: 'pickup', label: 'Pickup and return', screens: ['pickup-location', 'return-location', 'hours', 'handover'] },
  {
    id: 'guest',
    label: 'Guest information and policies',
    screens: ['requirements', 'accessibility', 'suitability', 'inclusions', 'restrictions', 'rules', 'cancellation', 'deposit-info'],
  },
];
