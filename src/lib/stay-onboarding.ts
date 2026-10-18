/**
 * Fifteen focused Stay creation stages.
 * They write the same stay fields checkout already reads. They do not add a second pricing model.
 */

export const STAY_ONBOARDING_STAGES = [
  { id: 'location', title: 'Where is the property?', body: 'Search the place, then add the street address guests will need after they book.' },
  { id: 'confirm', title: 'Confirm the pin', body: 'The exact pin is stored for bookings. Travelers see the city before they book, not the apartment door.' },
  { id: 'property', title: 'What are you listing?', body: 'One listing is one bookable place. A second apartment is a second listing.' },
  { id: 'amenities', title: 'What can guests use?', body: 'Only select what is actually at the property.' },
  { id: 'rooms', title: 'Where will guests sleep?', body: 'Add each room or living area, then the beds in it. A bedroom count is not the same as how many people can sleep.' },
  { id: 'description', title: 'Describe the stay', body: 'Write what a guest should know. Do not claim a view, amenity, or facility that is not there.' },
  { id: 'booking', title: 'How guests book', body: 'Guests book instantly and pay at checkout. Request-to-book is not available yet.' },
  { id: 'availability', title: 'When is it open?', body: 'The check-in date is an occupied night. The checkout morning is not charged.' },
  { id: 'guests', title: 'Guests and length of stay', body: 'These limits are checked again at checkout.' },
  { id: 'pricing', title: 'Set the price', body: 'The nightly rate and cleaning fee are what checkout charges. An introductory discount is off until you turn one on after publishing.' },
  { id: 'arrival', title: 'How guests arrive', body: 'The public note can be seen before booking. Door codes belong in the private address.' },
  { id: 'photos', title: 'Add photos', body: 'The first photo is the cover. Bedroom photos stay attached to the rooms you created.' },
  { id: 'cancellation', title: 'Cancellation terms', body: 'Every stay uses Traverion’s standard terms. Custom refund rules are not active.' },
  { id: 'policies', title: 'House rules and safety', body: 'Choose the rules guests must accept. If your written rules disagree, fix one of them before publishing.' },
  { id: 'preview', title: 'Preview and publish', body: 'This is the stay guests will book. Publishing runs the same checks as the live listing.' },
] as const;

export type StayOnboardingStageId = (typeof STAY_ONBOARDING_STAGES)[number]['id'];

/** Old nine-step wizard indexes still used by publish-blocker links. */
const LEGACY_WIZARD_STAGE = [0, 2, 5, 3, 8, 11, 10, 13, 14] as const;

export function stayStageForLegacyWizardStep(step: number): number {
  return LEGACY_WIZARD_STAGE[step] ?? 0;
}

export type StayOnboardingCheck = {
  city: string;
  country: string;
  hasPlace: boolean;
  street: string;
  postal: string;
  locationConfirmed: boolean;
  title: string;
  propertyType: string;
  areasWithBeds: number;
  maxGuests: number | null;
  minNights: number | null;
  maxNights: number | null;
  sleepCapacity: number;
  nightly: number | null;
  checkIn: string;
  checkOut: string;
  arrivalMethod: string;
  photoCount: number;
  address: string;
  rulesChosen: boolean;
  descriptionLength: number;
  minDescription: number;
  minTitle: number;
};

const CLOCK = /^\d{2}:\d{2}$/;

export function stayStageBlocker(stage: number, draft: StayOnboardingCheck): string | null {
  switch (stage) {
    case 0:
      if (!draft.hasPlace || !draft.city.trim() || !draft.country.trim()) return 'Search and select the city.';
      if (draft.street.trim().length < 3) return 'Add the street and building number.';
      if (draft.postal.trim().length < 2) return 'Add the postal code.';
      return null;
    case 1:
      return draft.locationConfirmed ? null : 'Confirm the pin before continuing.';
    case 2:
      if (!draft.propertyType.trim()) return 'Choose a property type.';
      if (draft.title.trim().length < draft.minTitle) return `Use at least ${draft.minTitle} characters in the name.`;
      return null;
    case 3:
      return null;
    case 4:
      return draft.areasWithBeds >= 1 ? null : 'Add at least one bed guests can sleep in.';
    case 5:
      return draft.descriptionLength >= draft.minDescription
        ? null
        : `Write at least ${draft.minDescription} characters so guests know what to expect.`;
    case 6:
      if (!CLOCK.test(draft.checkIn)) return 'Choose a check-in time.';
      if (!CLOCK.test(draft.checkOut)) return 'Choose a checkout time.';
      return null;
    case 7:
      return null;
    case 8:
      if (draft.maxGuests == null || draft.maxGuests < 1) return 'Set how many guests can stay.';
      if (draft.minNights == null || draft.minNights < 1) return 'Minimum stay is at least 1 night.';
      if (draft.maxNights != null && draft.maxNights < draft.minNights) return 'Maximum nights cannot be below the minimum.';
      if (draft.sleepCapacity >= 1 && draft.maxGuests > draft.sleepCapacity) {
        return `The beds sleep ${draft.sleepCapacity}. Lower the guest limit or add beds.`;
      }
      return null;
    case 9:
      return draft.nightly != null && draft.nightly > 0 ? null : 'Enter a nightly price.';
    case 10:
      if (!draft.arrivalMethod) return 'Choose how guests arrive.';
      if (draft.address.trim().length < 8) return 'Add the private arrival address booked guests receive after payment.';
      return null;
    case 11:
      return draft.photoCount >= 1 ? null : 'Add at least one photo. Publishing still requires a full gallery.';
    case 12:
      return null;
    case 13:
      return draft.rulesChosen ? null : 'Choose pets, smoking, and parties.';
    default:
      return null;
  }
}
