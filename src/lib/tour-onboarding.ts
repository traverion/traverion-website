/**
 * Tour creation screens — same focused full-screen pattern as Stay / Rental.
 * Screens flatten Basics + Information scenes while Experience / Options /
 * Photos / Preview keep existing Tour field surfaces and business rules.
 */

import {
  areFilledListingLineItemsValid,
  TOUR_EXCLUDE_MAX,
  TOUR_INCLUDE_MAX,
  TOUR_INCLUDE_MIN_REQUIRED,
} from './listing-creation-lines';
import {
  isTourIdentitySatisfied,
  isTourLocationSatisfied,
  isTourProductTypeSatisfied,
} from './listing-creation-scenes';
import {
  fullDescriptionContinueMessage,
  isListingDescriptionLengthValid,
  shortDescriptionContinueMessage,
} from './listingQualityScore';
import type { ListingBookingOption } from '../types/listingExtras';

export const TOUR_ONBOARDING_SCREENS = [
  {
    id: 'product-type',
    group: 'Basics',
    part: '1 of 3',
    title: 'What are you creating?',
    body: 'Choose the product type travelers will book.',
  },
  {
    id: 'location',
    group: 'Basics',
    part: '2 of 3',
    title: 'Where is it, and in what language?',
    body: 'City, country, and the language of this listing.',
  },
  {
    id: 'identity',
    group: 'Basics',
    part: '3 of 3',
    title: 'Give your product an identity',
    body: 'Title and short description guests see first.',
  },
  {
    id: 'experience',
    group: 'Experience',
    part: '1 of 1',
    title: 'Describe the experience',
    body: 'Full description, highlights, and what is included.',
  },
  {
    id: 'guest-prep',
    group: 'Information',
    part: '1 of 3',
    title: 'What should guests know before arriving?',
    body: 'Help travelers prepare for their experience.',
  },
  {
    id: 'suitability',
    group: 'Information',
    part: '2 of 3',
    title: 'Who is this experience suitable for?',
    body: 'Participation restrictions and accessibility.',
  },
  {
    id: 'languages-contact',
    group: 'Information',
    part: '3 of 3',
    title: 'How can travelers communicate with you?',
    body: 'Experience languages and a contact number for confirmed bookings.',
  },
  {
    id: 'options',
    group: 'Options',
    part: '1 of 1',
    title: 'Booking options',
    body: 'Ways travelers can book — pricing, meeting point, and schedule.',
  },
  {
    id: 'photos',
    group: 'Photos',
    part: '1 of 1',
    title: 'Add photos',
    body: 'The first photo is the cover guests see in search.',
  },
  {
    id: 'preview',
    group: 'Preview',
    part: '1 of 1',
    title: 'Review and publish',
    body: 'Check readiness, then publish or save as draft.',
  },
] as const;

export type TourOnboardingScreenId = (typeof TOUR_ONBOARDING_SCREENS)[number]['id'];

/** Map old wizard step + scene storage onto the focused screen list. */
const LEGACY_STEP_TO_SCREEN: TourOnboardingScreenId[] = [
  'product-type',
  'experience',
  'guest-prep',
  'options',
  'photos',
  'preview',
];

export type TourOnboardingCheck = {
  experienceKind: string;
  experienceLanguage: string;
  city: string;
  country: string;
  title: string;
  subtitle: string;
  description: string;
  includes: string[];
  excludes: string[];
  bookingOptions: ListingBookingOption[];
  /** True when ≥1 ready option has meeting point or pickup (same as Options Continue). */
  optionsContinueReady: boolean;
  photoCount: number;
  photosPublishReady: boolean;
  isNewCreation: boolean;
};

export function tourScreenIndex(id: string): number {
  const index = TOUR_ONBOARDING_SCREENS.findIndex((screen) => screen.id === id);
  return index >= 0 ? index : 0;
}

export function tourScreenIndexFromStorage(
  storedId: string | null,
  legacyStep: string | null,
  legacyBasicsScene: string | null,
  legacyInfoScene: string | null
): number {
  if (storedId && TOUR_ONBOARDING_SCREENS.some((s) => s.id === storedId)) {
    return tourScreenIndex(storedId);
  }

  const step = Number.parseInt(legacyStep ?? '', 10);
  const basicsScene = Number.parseInt(legacyBasicsScene ?? '', 10);
  const infoScene = Number.parseInt(legacyInfoScene ?? '', 10);

  if (Number.isFinite(step) && step === 0 && Number.isFinite(basicsScene)) {
    if (basicsScene <= 0) return tourScreenIndex('product-type');
    if (basicsScene === 1) return tourScreenIndex('location');
    return tourScreenIndex('identity');
  }
  if (Number.isFinite(step) && step === 2 && Number.isFinite(infoScene)) {
    if (infoScene <= 0) return tourScreenIndex('guest-prep');
    if (infoScene === 1) return tourScreenIndex('suitability');
    return tourScreenIndex('languages-contact');
  }
  if (Number.isFinite(step) && LEGACY_STEP_TO_SCREEN[step]) {
    return tourScreenIndex(LEGACY_STEP_TO_SCREEN[step]);
  }
  return 0;
}

export function tourBasicsSceneIndexForScreen(id: TourOnboardingScreenId): number | null {
  if (id === 'product-type') return 0;
  if (id === 'location') return 1;
  if (id === 'identity') return 2;
  return null;
}

export function tourInformationSceneIndexForScreen(id: TourOnboardingScreenId): number | null {
  if (id === 'guest-prep') return 0;
  if (id === 'suitability') return 1;
  if (id === 'languages-contact') return 2;
  return null;
}

export function tourStageBlocker(
  screenId: TourOnboardingScreenId,
  check: TourOnboardingCheck
): string | null {
  switch (screenId) {
    case 'product-type':
      return isTourProductTypeSatisfied({ experienceKind: check.experienceKind })
        ? null
        : 'Choose a product type to continue.';
    case 'location':
      return isTourLocationSatisfied({
        experienceLanguage: check.experienceLanguage,
        city: check.city,
        country: check.country,
      })
        ? null
        : 'Add listing language, city, and country to continue.';
    case 'identity': {
      if (
        !isTourIdentitySatisfied({
          title: check.title,
          subtitle: check.subtitle,
        })
      ) {
        return (
          shortDescriptionContinueMessage(check.subtitle, 300) ??
          'Add a title (10–65 characters) and short description (at least 100 characters).'
        );
      }
      return null;
    }
    case 'experience': {
      const desc = fullDescriptionContinueMessage(check.description);
      if (desc) return desc;
      const incLines = check.includes.map((s) => s.trim()).filter(Boolean);
      const excLines = check.excludes.map((s) => s.trim()).filter(Boolean);
      if (incLines.length < TOUR_INCLUDE_MIN_REQUIRED) {
        return `Add at least ${TOUR_INCLUDE_MIN_REQUIRED} inclusions to continue.`;
      }
      if (incLines.length > TOUR_INCLUDE_MAX) {
        return `Use at most ${TOUR_INCLUDE_MAX} inclusions.`;
      }
      if (excLines.length > TOUR_EXCLUDE_MAX) {
        return `Use at most ${TOUR_EXCLUDE_MAX} exclusions.`;
      }
      if (!areFilledListingLineItemsValid(incLines) || !areFilledListingLineItemsValid(excLines)) {
        return 'Each inclusion or exclusion must be 3–60 characters.';
      }
      if (!isListingDescriptionLengthValid(check.description)) {
        return fullDescriptionContinueMessage(check.description);
      }
      return null;
    }
    case 'guest-prep':
    case 'suitability':
    case 'languages-contact':
      // Optional Information fields never block Continue (publish still gates phone).
      return null;
    case 'options':
      return check.optionsContinueReady
        ? null
        : 'Add at least one bookable option with meeting point or pickup to continue.';
    case 'photos': {
      if (check.isNewCreation) {
        return check.photosPublishReady
          ? null
          : 'Add 4–12 photos with a real cover image to continue.';
      }
      return check.photoCount >= 1 ? null : 'Add at least one photo to continue.';
    }
    case 'preview':
      return null;
    default:
      return null;
  }
}

export function tourScreenIndexForPublishLine(line: string): number {
  const text = line.toLowerCase();
  if (/photo|image|gallery|cover|hero|placeholder/.test(text)) return tourScreenIndex('photos');
  if (/option|schedule|price|meet|pickup|cutoff|weekday|spot|guest per|how guests start/.test(text)) {
    return tourScreenIndex('options');
  }
  if (/booking contact|phone|language|spoken/.test(text)) return tourScreenIndex('languages-contact');
  if (/accessib|know before|what to bring|requirement|not suitable/.test(text)) {
    return tourScreenIndex('guest-prep');
  }
  if (/include|exclude|full description|highlight/.test(text)) return tourScreenIndex('experience');
  if (/short description|subtitle/.test(text)) return tourScreenIndex('identity');
  if (/title/.test(text)) return tourScreenIndex('identity');
  if (/city|country|location|destination|language of this listing/.test(text)) {
    return tourScreenIndex('location');
  }
  if (/product type|tour or activity|ticket|transportation/.test(text)) {
    return tourScreenIndex('product-type');
  }
  return tourScreenIndex('preview');
}

/** @deprecated Bridge older wizard step indexes into focused screens. */
export function tourStageForLegacyWizardStep(step: number): number {
  return tourScreenIndex(LEGACY_STEP_TO_SCREEN[step] ?? 'product-type');
}
