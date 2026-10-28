/**
 * Rental Creator screens — streamlined journey (22 screens).
 * Duration mode/limits live on each rental option (not a listing screen).
 * Split-out screens remap via LEGACY_RENTAL_SCREEN_ALIASES so drafts resume.
 */

import type { RentalDetails } from '../types/rental';
import { rentalCategoryConfig } from './rental-categories';
import { isRentalCancellationPreset } from './rental-cancellation';
import {
  rentalMissingOptionRateMessage,
  rentalOperatingHoursIssue,
  rentalOptionNameReady,
  rentalVariantComplete,
} from './rental-details';

export const RENTAL_ONBOARDING_SCREENS = [
  {
    id: 'basics-category',
    group: 'Basics',
    part: '1 of 7',
    title: 'What are you renting out?',
    body: 'Choose the category that best matches your rental.',
  },
  {
    id: 'basics-item',
    group: 'Basics',
    part: '2 of 7',
    title: 'Which item type?',
    body: 'Pick the closest match for this category. You can refine details later.',
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
    body: 'Write a clear description of what customers are renting.',
  },
  {
    id: 'basics-highlights',
    group: 'Basics',
    part: '6 of 7',
    title: 'Add highlights',
    body: 'Optional short points customers can scan. Only add what is true for this rental.',
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
    part: '1 of 5',
    title: 'Pickup place',
    body: 'Where customers collect the rental.',
  },
  {
    id: 'return-location',
    group: 'Pickup & return',
    part: '2 of 5',
    title: 'Return place',
    body: 'Where customers bring the rental back. Use the same spot as pickup, or set a different place.',
  },
  {
    id: 'hours',
    group: 'Pickup & return',
    part: '3 of 5',
    title: 'Pickup and return hours',
    body: 'Choose the open days, then set one pickup window and one return window.',
  },
  {
    id: 'pickup-handover',
    group: 'Pickup & return',
    part: '4 of 5',
    title: 'Pickup handover',
    body: 'How customers receive the rental at pickup.',
  },
  {
    id: 'return-handover',
    group: 'Pickup & return',
    part: '5 of 5',
    title: 'Return handover',
    body: 'How customers hand the rental back at return.',
  },
  {
    id: 'options',
    group: 'Rental options',
    part: '1 of 1',
    title: 'Rental options',
    body: 'Each option has its own rental type, duration limits, price, and stock.',
  },
  {
    id: 'booking-rules',
    group: 'Availability',
    part: '1 of 1',
    title: 'Notice and preparation',
    body: 'Notice is how far ahead a customer must book. Preparation is the buffer between two rentals.',
  },
  {
    id: 'requirements',
    group: 'Guest information',
    part: '1 of 5',
    title: 'Who can book',
    body: 'Age, identification, licence, experience, accessibility, and suitability.',
  },
  {
    id: 'inclusions',
    group: 'Guest information',
    part: '2 of 5',
    title: "What's included and restricted",
    body: 'Items provided with the rental, and uses you do not allow.',
  },
  {
    id: 'rules',
    group: 'Guest information',
    part: '3 of 5',
    title: 'Rental rules',
    body: 'Permitted use, return condition, cleaning, damage, and late returns.',
  },
  {
    id: 'cancellation',
    group: 'Guest information',
    part: '4 of 5',
    title: 'Cancellation policy',
    body: 'The window customers may request cancellation. Traverion does not issue automatic rental refunds.',
  },
  {
    id: 'deposit-info',
    group: 'Guest information',
    part: '5 of 5',
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
    title: 'Publish rental',
    body: 'Publish when ready so travelers can discover and book this rental.',
  },
] as const;

export type RentalOnboardingScreenId = (typeof RENTAL_ONBOARDING_SCREENS)[number]['id'];

/**
 * Maps retired screen ids onto the current 22-screen journey so drafts resume.
 * Listing-level duration screens now land on options (duration lives per option).
 */
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
  pickup: 'pickup-location',
  return: 'return-location',
  collection: 'pickup-handover',
  handover: 'pickup-handover',
  duration: 'options',
  'duration-mode': 'options',
  'duration-limits': 'options',
  'daily-rules': 'options',
  'daily-counting': 'options',
  buffers: 'booking-rules',
  notice: 'booking-rules',
  'availability-summary': 'options',
  pricing: 'options',
  'multi-day': 'options',
  'pricing-overrides': 'options',
  earnings: 'options',
  accessibility: 'requirements',
  suitability: 'requirements',
  restrictions: 'inclusions',
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
      if (!r.category) return 'Choose a rental category first.';
      const cfg = rentalCategoryConfig(r.category);
      if (r.itemType === 'custom') {
        if (!cfg?.allowCustomItemType) return 'Choose an item type.';
        return (r.customItemType ?? '').trim() ? null : 'Enter a custom item type.';
      }
      if (!r.itemType || !cfg?.itemTypes.some((t) => t.id === r.itemType)) {
        return 'Choose an item type.';
      }
      return null;
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
      return null;
    case 'basics-specs':
      return null;
    case 'photos': {
      if (check.galleryCount < 1) return 'Add at least one photo.';
      if (check.galleryCount < 3) return 'Add at least 3 photos before continuing.';
      return null;
    }
    case 'pickup-location':
      return (r.pickupAddress || '').trim().length >= 5
        ? null
        : 'Add a pickup address or meeting place.';
    case 'return-location':
      if (r.returnSameAsPickup === false && (r.returnAddress || '').trim().length < 5) {
        return 'Add a return address, or choose same as pickup.';
      }
      return null;
    case 'pickup-handover':
      return r.staffAssisted === true || r.staffAssisted === false
        ? null
        : 'Choose staff handover or self-service pickup.';
    case 'return-handover':
      return r.returnStaffAssisted === true || r.returnStaffAssisted === false
        ? null
        : 'Choose staff return or self-service return.';
    case 'hours': {
      const open = (r.operatingDays ?? []).some((d) => d.open);
      if (!open) return 'Select at least one operating day.';
      return rentalOperatingHoursIssue(r.operatingDays);
    }
    case 'options': {
      const variants = r.variants ?? [];
      if (variants.length < 1) return 'Add at least one rental option.';
      if (!variants.some((v) => rentalVariantComplete(v, r))) {
        return 'Finish at least one rental option with name, quantity, duration, and pricing.';
      }
      if (!variants.every((v) => rentalOptionNameReady(v.name) && v.quantity >= 1)) {
        return 'Each option needs a name and at least 1 unit.';
      }
      return rentalMissingOptionRateMessage(r);
    }
    case 'booking-rules':
      return null;
    case 'requirements':
      if (r.category === 'snowmobiles' || r.category === 'vehicles') {
        const license = (r.requirements?.license ?? '').trim();
        if (!license) return 'Describe the licence or driver requirements.';
      }
      return null;
    case 'cancellation':
      return isRentalCancellationPreset(r.cancellationPreset) ? null : 'Choose a cancellation policy.';
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
  if (r.returnSameAsPickup === false && !(r.returnAddress || '').trim()) {
    out.push('Add a return address, or choose same as pickup.');
  }
  if (r.staffAssisted !== true && r.staffAssisted !== false) {
    out.push('Choose a pickup handover method.');
  }
  if (r.returnStaffAssisted !== true && r.returnStaffAssisted !== false) {
    out.push('Choose a return handover method.');
  }
  const variants = r.variants ?? [];
  if (variants.length < 1) out.push('Add at least one rental option.');
  for (const v of variants) {
    if (!rentalVariantComplete(v, r)) {
      out.push(`Finish option “${v.name || 'Untitled'}” (quantity, duration, and pricing).`);
    }
  }
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
  if (/return handover|staff return|self-service return/.test(text)) {
    return rentalScreenIndex('return-handover');
  }
  if (/pickup handover|staff handover|self-service pickup|handover method/.test(text)) {
    return rentalScreenIndex('pickup-handover');
  }
  if (/handover/.test(text)) return rentalScreenIndex('pickup-handover');
  if (/hours/.test(text)) return rentalScreenIndex('hours');
  if (/return address|return location|same as pickup/.test(text)) return rentalScreenIndex('return-location');
  if (/pickup|return/.test(text)) return rentalScreenIndex('pickup-location');
  if (/option|variant|quantity|pricing|price|duration|hourly|daily/.test(text)) {
    return rentalScreenIndex('options');
  }
  if (/notice|buffer|preparation/.test(text)) return rentalScreenIndex('booking-rules');
  if (/snowmobile|license|requirement|accessib|suitab/.test(text)) return rentalScreenIndex('requirements');
  if (/restriction|included|inclusion/.test(text)) return rentalScreenIndex('inclusions');
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
    screens: [
      'basics-category',
      'basics-item',
      'basics-location',
      'basics-title',
      'basics-description',
      'basics-highlights',
      'basics-specs',
    ],
  },
  { id: 'photos', label: 'Photos', screens: ['photos'] },
  { id: 'options', label: 'Rental options', screens: ['options'] },
  { id: 'pricing', label: 'Availability', screens: ['booking-rules'] },
  {
    id: 'pickup',
    label: 'Pickup and return',
    screens: ['pickup-location', 'return-location', 'hours', 'pickup-handover', 'return-handover'],
  },
  {
    id: 'guest',
    label: 'Guest information and policies',
    screens: ['requirements', 'inclusions', 'rules', 'cancellation', 'deposit-info'],
  },
];
