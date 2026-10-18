/**
 * Stay creation screens. Fifteen groups, more than fifteen screens.
 * Each screen writes listing fields checkout already reads.
 */

export const STAY_ONBOARDING_SCREENS = [
  { id: 'location', group: 'Location', part: '1 of 1', title: 'Where is the property?', body: 'Search the city, then add the street address. Guests see the city before they book.' },
  { id: 'confirm', group: 'Location', part: 'Pin', title: 'Confirm the pin', body: 'Move the pin onto the property. The public page shows the city, not the apartment door.' },
  { id: 'property-type', group: 'Property', part: '1 of 2', title: 'What kind of place is this?', body: 'One listing is one bookable place.' },
  { id: 'property-name', group: 'Property', part: '2 of 2', title: 'Name the accommodation', body: 'This is the title guests see in search.' },
  { id: 'amenities', group: 'Amenities', part: '1 of 1', title: 'What can guests use?', body: 'Select only what is actually there.' },
  { id: 'rooms', group: 'Sleeping', part: '1 of 1', title: 'Where will guests sleep?', body: 'A bedroom count is not the same as how many people the beds sleep.' },
  { id: 'description', group: 'Description', part: '1 of 2', title: 'Describe the stay', body: 'Write what a guest should know. Do not claim anything the property does not have.' },
  { id: 'highlights', group: 'Description', part: '2 of 2', title: 'What makes this place specific?', body: 'Choose only highlights you can stand behind.' },
  { id: 'booking-method', group: 'Booking', part: '1 of 3', title: 'How reservations work', body: 'Guests confirm an available stay and pay at checkout.' },
  { id: 'booking-times', group: 'Booking', part: '2 of 3', title: 'Check-in and checkout', body: 'Times use the property’s local clock.' },
  { id: 'booking-cutoff', group: 'Booking', part: '3 of 3', title: 'How much notice do you need?', body: 'Checkout stops new reservations when this notice has passed.' },
  { id: 'availability', group: 'Availability', part: '1 of 1', title: 'When can guests arrive?', body: 'The check-in date is an occupied night. The checkout morning is not charged.' },
  { id: 'guests', group: 'Guests', part: '1 of 2', title: 'How many guests?', body: 'This cannot be higher than the beds you added.' },
  { id: 'stay-length', group: 'Guests', part: '2 of 2', title: 'How long can they stay?', body: 'Checkout uses the same minimum and maximum.' },
  { id: 'price', group: 'Pricing', part: '1 of 2', title: 'Set the nightly price', body: 'This is the price for the accommodation, not per person.' },
  { id: 'fees', group: 'Pricing', part: '2 of 2', title: 'Cleaning and extras', body: 'Optional extras are charged only when a guest selects them. Mandatory fees are included.' },
  { id: 'arrival-method', group: 'Arrival', part: '1 of 2', title: 'How do guests get in?', body: 'Guests see the method. They do not see a door code here.' },
  { id: 'arrival-notes', group: 'Arrival', part: '2 of 2', title: 'What should guests know?', body: 'The public note can appear before booking. The street address is shared after payment.' },
  { id: 'photos', group: 'Photos', part: '1 of 2', title: 'Add photos', body: 'The first photo is the cover guests see in search.' },
  { id: 'room-photos', group: 'Photos', part: '2 of 2', title: 'Photos of each room', body: 'Attach pictures to the rooms you already created.' },
  { id: 'cancellation', group: 'Cancellation', part: '1 of 1', title: 'Cancellation terms', body: 'Guests see these terms before they pay. A booking keeps the terms from that moment.' },
  { id: 'house-rules', group: 'House rules', part: '1 of 2', title: 'House preferences', body: 'These are the rules guests accept with the booking.' },
  { id: 'quiet-hours', group: 'House rules', part: '2 of 2', title: 'Quiet hours and other rules', body: 'Written rules and the times below should say the same thing.' },
  { id: 'safety', group: 'Safety', part: '1 of 1', title: 'Anything guests should know about safety?', body: 'Mention exterior cameras or hazards. Leaving this blank does not certify that none exist.' },
  { id: 'preview', group: 'Preview', part: '1 of 2', title: 'This is what guests see', body: 'Private arrival details stay off this preview.' },
  { id: 'publish', group: 'Preview', part: '2 of 2', title: 'Ready to publish?', body: 'Publishing runs the same checks as the live listing.' },
] as const;

export type StayOnboardingScreenId = (typeof STAY_ONBOARDING_SCREENS)[number]['id'];

const V1_STAGE_IDS: StayOnboardingScreenId[] = [
  'location',
  'confirm',
  'property-type',
  'amenities',
  'rooms',
  'description',
  'booking-method',
  'availability',
  'guests',
  'price',
  'arrival-method',
  'photos',
  'cancellation',
  'house-rules',
  'preview',
];

export function stayScreenIndex(id: string): number {
  const index = STAY_ONBOARDING_SCREENS.findIndex((screen) => screen.id === id);
  return index >= 0 ? index : 0;
}

export function stayScreenIndexFromStorage(storedId: string | null, legacyIndex: string | null): number {
  if (storedId && STAY_ONBOARDING_SCREENS.some((screen) => screen.id === storedId)) return stayScreenIndex(storedId);
  const legacy = Number.parseInt(legacyIndex ?? '', 10);
  if (Number.isFinite(legacy) && V1_STAGE_IDS[legacy]) return stayScreenIndex(V1_STAGE_IDS[legacy]);
  return 0;
}

export function stayScreenIndexForPublishLine(line: string): number {
  const text = line.toLowerCase();
  if (/photo|image|gallery|cover|hero|placeholder/.test(text)) return stayScreenIndex('photos');
  if (/check-in address|arrival address|street/.test(text)) return stayScreenIndex('arrival-notes');
  if (/city|country|location|destination/.test(text)) return stayScreenIndex('location');
  if (/nightly|price/.test(text)) return stayScreenIndex('price');
  if (/check-in time|check-out time/.test(text)) return stayScreenIndex('booking-times');
  if (/guest|bedroom|bed|sleep|host/.test(text)) return stayScreenIndex('guests');
  if (/description|highlight/.test(text)) return stayScreenIndex('description');
  return stayScreenIndex('property-name');
}

/** @deprecated Use stayScreenIndexForPublishLine. Kept so older wizard indexes still open a valid screen. */
export function stayStageForLegacyWizardStep(step: number): number {
  const ids: StayOnboardingScreenId[] = ['location', 'property-type', 'description', 'amenities', 'price', 'photos', 'arrival-method', 'house-rules', 'preview'];
  return stayScreenIndex(ids[step] ?? 'location');
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
  exteriorCamera: boolean;
  safetyNote: string;
};

const CLOCK = /^\d{2}:\d{2}$/;

export function stayStageBlocker(screenId: string, draft: StayOnboardingCheck): string | null {
  switch (screenId) {
    case 'location':
      if (!draft.hasPlace || !draft.city.trim() || !draft.country.trim()) return 'Search and select the city.';
      if (draft.street.trim().length < 3) return 'Add the street and building number.';
      if (draft.postal.trim().length < 2) return 'Add the postal code.';
      return null;
    case 'confirm':
      return draft.locationConfirmed ? null : 'Confirm the pin before continuing.';
    case 'property-type':
      return draft.propertyType.trim() ? null : 'Choose a property type.';
    case 'property-name':
      return draft.title.trim().length < draft.minTitle ? `Use at least ${draft.minTitle} characters in the name.` : null;
    case 'rooms':
      return draft.areasWithBeds >= 1 ? null : 'Add at least one bed guests can sleep in.';
    case 'description':
      return draft.descriptionLength >= draft.minDescription
        ? null
        : `Write at least ${draft.minDescription} characters so guests know what to expect.`;
    case 'booking-times':
      if (!CLOCK.test(draft.checkIn)) return 'Choose a check-in time.';
      if (!CLOCK.test(draft.checkOut)) return 'Choose a checkout time.';
      return null;
    case 'guests':
      if (draft.maxGuests == null || draft.maxGuests < 1) return 'Set how many guests can stay.';
      if (draft.sleepCapacity >= 1 && draft.maxGuests > draft.sleepCapacity) {
        return `The beds sleep ${draft.sleepCapacity}. Lower the guest limit or add beds.`;
      }
      return null;
    case 'stay-length':
      if (draft.minNights == null || draft.minNights < 1) return 'Minimum stay is at least 1 night.';
      if (draft.maxNights != null && draft.maxNights < draft.minNights) return 'Maximum nights cannot be below the minimum.';
      return null;
    case 'price':
      return draft.nightly != null && draft.nightly > 0 ? null : 'Enter a nightly price.';
    case 'arrival-method':
      return draft.arrivalMethod ? null : 'Choose how guests arrive.';
    case 'arrival-notes':
      return draft.address.trim().length >= 8 ? null : 'Add the private arrival address booked guests receive after payment.';
    case 'photos':
      return draft.photoCount >= 1 ? null : 'Add at least one photo. Publishing still requires a full gallery.';
    case 'house-rules':
      return draft.rulesChosen ? null : 'Choose pets, smoking, and parties.';
    case 'safety':
      if (draft.exteriorCamera && draft.safetyNote.trim().length < 8) return 'Say where the exterior camera is.';
      return null;
    default:
      return null;
  }
}

/** Pull a quiet-hours range out of free text. Does not change saved times by itself. */
export function quietHoursMentioned(text: string): { start: string; end: string } | null {
  const match = text.match(/quiet hours[^0-9]{0,40}(\d{1,2})(?::(\d{2}))?\s*[–-]\s*(\d{1,2})(?::(\d{2}))?/i);
  if (!match) return null;
  const startH = Number(match[1]);
  const endH = Number(match[3]);
  if (startH > 23 || endH > 23) return null;
  const start = `${String(startH).padStart(2, '0')}:${match[2] ?? '00'}`;
  const end = `${String(endH).padStart(2, '0')}:${match[4] ?? '00'}`;
  if (start === end) return null;
  return { start, end };
}
