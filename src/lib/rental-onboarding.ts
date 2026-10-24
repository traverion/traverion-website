/**
 * Rental Creator screens — focused sub-screens, Stay-inspired navigation.
 */

import type { RentalDetails } from '../types/rental';
import { rentalCategoryConfig } from './rental-categories';
import { rentalVariantComplete } from './rental-details';

export const RENTAL_ONBOARDING_SCREENS = [
  { id: 'category', group: 'Getting started', part: '1 of 4', title: 'What are you renting out?', body: 'Choose the category that best matches your equipment.' },
  { id: 'item-type', group: 'Getting started', part: '2 of 4', title: 'What type of item?', body: 'Pick the closest match. You can refine details later.' },
  { id: 'location', group: 'Getting started', part: '3 of 4', title: 'Where is your rental located?', body: 'Customers use this to find you. Exact pickup can be more specific later.' },
  { id: 'language', group: 'Getting started', part: '4 of 4', title: 'Listing language', body: 'The language of your title and descriptions.' },
  { id: 'title', group: 'Rental details', part: '1 of 5', title: 'What would you like to call your rental?', body: 'This is the title customers see in search.' },
  { id: 'intro', group: 'Rental details', part: '2 of 5', title: 'Short introduction', body: 'One or two sentences that explain what you rent.' },
  { id: 'description', group: 'Rental details', part: '3 of 5', title: 'Describe the rental', body: 'Tell customers what to expect and what makes this useful.' },
  { id: 'highlights', group: 'Rental details', part: '4 of 5', title: 'Rental highlights', body: 'Add a few concrete selling points — not filler. Skip any that do not help customers decide.' },
  { id: 'specs', group: 'Rental details', part: '5 of 5', title: 'Item specifications', body: 'Shared facts for this listing. Differences between sizes belong in options.' },
  { id: 'photos', group: 'Photos', part: '1 of 2', title: 'Add rental photos', body: 'The first photo is the cover customers see in search.' },
  { id: 'gallery', group: 'Photos', part: '2 of 2', title: 'Review your gallery', body: 'Reorder or remove photos before continuing.' },
  { id: 'pickup', group: 'Pickup & return', part: '1 of 4', title: 'Where do customers collect the rental?', body: 'Describe the collection point clearly.' },
  { id: 'return', group: 'Pickup & return', part: '2 of 4', title: 'Where do customers return it?', body: 'Same place as pickup, or a different address.' },
  { id: 'hours', group: 'Pickup & return', part: '3 of 4', title: 'Pickup and return hours', body: 'Days and times when handovers are possible.' },
  { id: 'collection', group: 'Pickup & return', part: '4 of 4', title: 'Collection instructions', body: 'How customers receive the item on the day.' },
  { id: 'options', group: 'Rental options', part: '1 of 1', title: 'Rental options', body: 'Create the choices customers pick — sizes, models, or a single standard option.' },
  { id: 'duration-mode', group: 'Availability', part: '1 of 6', title: 'How long can customers rent?', body: 'Hourly, daily, or both.' },
  { id: 'duration-limits', group: 'Availability', part: '2 of 6', title: 'Minimum and maximum duration', body: 'Keep limits realistic for your inventory.' },
  { id: 'daily-rules', group: 'Availability', part: '3 of 6', title: 'Daily rental rules', body: 'Calendar-day rentals use your pickup and return hours.' },
  { id: 'buffers', group: 'Availability', part: '4 of 6', title: 'Preparation time', body: 'Time you need between one booking ending and the next starting.' },
  { id: 'notice', group: 'Availability', part: '5 of 6', title: 'Booking notice', body: 'How far in advance customers must book.' },
  { id: 'availability-summary', group: 'Availability', part: '6 of 6', title: 'Availability overview', body: 'Confirm the rules that apply to this listing.' },
  { id: 'pricing', group: 'Pricing', part: '1 of 4', title: 'Set your rental prices', body: 'Shared rates that options inherit by default.' },
  { id: 'multi-day', group: 'Pricing', part: '2 of 4', title: 'Multi-day pricing', body: 'Optional discount when customers rent several days.' },
  { id: 'pricing-overrides', group: 'Pricing', part: '3 of 4', title: 'Shared pricing and overrides', body: 'Options inherit these rates unless you set a custom price.' },
  { id: 'earnings', group: 'Pricing', part: '4 of 4', title: 'Customer price and your earnings', body: 'An example based on your shared daily or hourly rate — not a final checkout quote.' },
  { id: 'requirements', group: 'Policies', part: '1 of 5', title: 'Customer requirements', body: 'Who can rent, and what they need to bring.' },
  { id: 'inclusions', group: 'Policies', part: '2 of 5', title: "What's included?", body: 'Items provided with the rental at no extra charge.' },
  { id: 'rules', group: 'Policies', part: '3 of 5', title: 'Important rental rules', body: 'Use, return condition, and late returns.' },
  { id: 'cancellation', group: 'Policies', part: '4 of 5', title: 'Cancellation policy', body: 'Customers see these terms before they pay — once bookings open.' },
  { id: 'deposit-info', group: 'Policies', part: '5 of 5', title: 'Deposits and insurance', body: 'Optional supplier-managed terms. Traverion does not collect security deposits online.' },
  { id: 'preview', group: 'Preview', part: '1 of 2', title: 'Review your rental listing', body: 'A structured preview of what travelers will eventually see. Bookings stay closed until Rentals launches.' },
  { id: 'publish', group: 'Preview', part: '2 of 2', title: 'Finish rental setup', body: 'Confirm a complete draft. Your listing stays unpublished — travelers cannot book yet.' },
] as const;

export type RentalOnboardingScreenId = (typeof RENTAL_ONBOARDING_SCREENS)[number]['id'];

export function rentalScreenIndex(id: string): number {
  const index = RENTAL_ONBOARDING_SCREENS.findIndex((screen) => screen.id === id);
  return index >= 0 ? index : 0;
}

export function rentalScreenIndexFromStorage(storedId: string | null): number {
  if (storedId && RENTAL_ONBOARDING_SCREENS.some((s) => s.id === storedId)) {
    return rentalScreenIndex(storedId);
  }
  return 0;
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
    case 'category':
      return r.category ? null : 'Choose a rental category to continue.';
    case 'item-type': {
      if (!r.category) return 'Choose a category first.';
      if (r.itemType === 'custom') {
        return (r.customItemType ?? '').trim() ? null : 'Enter a custom item type.';
      }
      return r.itemType ? null : 'Choose an item type.';
    }
    case 'location':
      if (!(check.city || '').trim()) return 'Add a city.';
      if (!(check.country || '').trim()) return 'Add a country.';
      return null;
    case 'language':
      return (check.experienceLanguage || '').trim() ? null : 'Choose a listing language.';
    case 'title':
      return (check.title || '').trim().length >= 8 ? null : 'Use a title of at least 8 characters.';
    case 'intro':
      return (r.shortIntro || check.subtitle || '').trim().length >= 12
        ? null
        : 'Add a short introduction (at least 12 characters).';
    case 'description':
      return (check.description || '').trim().length >= 40
        ? null
        : 'Add a description of at least 40 characters.';
    case 'highlights':
      return null;
    case 'specs':
      return null;
    case 'photos':
    case 'gallery': {
      if (check.galleryCount < 1) return 'Add at least one photo.';
      if (check.galleryCount < 3) return 'Add at least 3 photos before continuing.';
      return null;
    }
    case 'pickup':
      return (r.pickupAddress || '').trim().length >= 5 ? null : 'Add a pickup address or meeting place.';
    case 'return':
      if (r.returnSameAsPickup !== false) return null;
      return (r.returnAddress || '').trim().length >= 5 ? null : 'Add a return address, or choose same as pickup.';
    case 'hours': {
      const open = (r.operatingDays ?? []).some((d) => d.open);
      return open ? null : 'Open at least one day for pickup and return.';
    }
    case 'collection':
      return null;
    case 'options': {
      const variants = r.variants ?? [];
      if (variants.length < 1) return 'Add at least one rental option.';
      if (!variants.every((v) => v.name.trim() && v.quantity >= 1)) {
        return 'Each option needs a name and at least 1 unit.';
      }
      return null;
    }
    case 'duration-mode':
      return r.durationMode ? null : 'Choose hourly, daily, or both.';
    case 'duration-limits': {
      const mode = r.durationMode ?? 'daily';
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
    case 'daily-rules':
    case 'buffers':
    case 'notice':
    case 'availability-summary':
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
    case 'multi-day':
    case 'pricing-overrides':
    case 'earnings':
      return null;
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
      return null;
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
  if (/categor/.test(text)) return rentalScreenIndex('category');
  if (/item type/.test(text)) return rentalScreenIndex('item-type');
  if (/title/.test(text)) return rentalScreenIndex('title');
  if (/description/.test(text)) return rentalScreenIndex('description');
  if (/city|country|location/.test(text)) return rentalScreenIndex('location');
  if (/pickup/.test(text)) return rentalScreenIndex('pickup');
  if (/option|variant|quantity|pricing/.test(text)) return rentalScreenIndex('options');
  if (/duration/.test(text)) return rentalScreenIndex('duration-mode');
  if (/snowmobile|license/.test(text)) return rentalScreenIndex('requirements');
  return rentalScreenIndex('publish');
}
