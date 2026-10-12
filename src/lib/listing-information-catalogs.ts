/** Stable IDs for Information-stage structured selections (translatable labels). */

export type CatalogOption = {
  id: string;
  label: string;
  group: string;
};

export const WHAT_TO_BRING_CATALOG: readonly CatalogOption[] = [
  { id: 'warm_clothing', label: 'Warm clothing', group: 'Winter clothing' },
  { id: 'thermal_underwear', label: 'Thermal underwear', group: 'Winter clothing' },
  { id: 'thermal_base_layer', label: 'Thermal base layer', group: 'Winter clothing' },
  { id: 'winter_jacket', label: 'Winter jacket', group: 'Winter clothing' },
  { id: 'winter_boots', label: 'Winter boots', group: 'Winter clothing' },
  { id: 'warm_socks', label: 'Warm socks', group: 'Winter clothing' },
  { id: 'gloves', label: 'Gloves', group: 'Winter clothing' },
  { id: 'mittens', label: 'Mittens', group: 'Winter clothing' },
  { id: 'winter_hat', label: 'Winter hat', group: 'Winter clothing' },
  { id: 'scarf', label: 'Scarf', group: 'Winter clothing' },
  { id: 'neck_warmer', label: 'Neck warmer', group: 'Winter clothing' },
  { id: 'snow_pants', label: 'Snow pants', group: 'Winter clothing' },
  { id: 'hand_warmers', label: 'Hand warmers', group: 'Winter clothing' },
  { id: 'comfortable_clothing', label: 'Comfortable clothing', group: 'General clothing' },
  { id: 'comfortable_walking_shoes', label: 'Comfortable walking shoes', group: 'General clothing' },
  { id: 'hiking_boots', label: 'Hiking boots', group: 'General clothing' },
  { id: 'waterproof_jacket', label: 'Waterproof jacket', group: 'General clothing' },
  { id: 'raincoat', label: 'Raincoat', group: 'General clothing' },
  { id: 'waterproof_trousers', label: 'Waterproof trousers', group: 'General clothing' },
  { id: 'swimwear', label: 'Swimwear', group: 'General clothing' },
  { id: 'change_of_clothes', label: 'Change of clothes', group: 'General clothing' },
  { id: 'towel', label: 'Towel', group: 'General clothing' },
  { id: 'sunglasses', label: 'Sunglasses', group: 'General clothing' },
  { id: 'passport', label: 'Passport', group: 'Documents & essentials' },
  { id: 'photo_id', label: 'Photo ID', group: 'Documents & essentials' },
  { id: 'drivers_license', label: "Driver's license", group: 'Documents & essentials' },
  { id: 'booking_confirmation', label: 'Booking confirmation', group: 'Documents & essentials' },
  { id: 'water_bottle', label: 'Water bottle', group: 'Documents & essentials' },
  { id: 'personal_medication', label: 'Personal medication', group: 'Documents & essentials' },
  { id: 'cash', label: 'Cash', group: 'Documents & essentials' },
  { id: 'payment_card', label: 'Payment card', group: 'Documents & essentials' },
  { id: 'mobile_phone', label: 'Mobile phone', group: 'Documents & essentials' },
  { id: 'power_bank', label: 'Power bank', group: 'Documents & essentials' },
  { id: 'small_backpack', label: 'Small backpack', group: 'Documents & essentials' },
  { id: 'camera', label: 'Camera', group: 'Outdoor equipment' },
  { id: 'tripod', label: 'Tripod', group: 'Outdoor equipment' },
  { id: 'headlamp', label: 'Headlamp', group: 'Outdoor equipment' },
  { id: 'flashlight', label: 'Flashlight', group: 'Outdoor equipment' },
  { id: 'sunscreen', label: 'Sunscreen', group: 'Outdoor equipment' },
  { id: 'insect_repellent', label: 'Insect repellent', group: 'Outdoor equipment' },
  { id: 'snacks', label: 'Snacks', group: 'Outdoor equipment' },
  { id: 'hiking_poles', label: 'Hiking poles', group: 'Outdoor equipment' },
  { id: 'binoculars', label: 'Binoculars', group: 'Outdoor equipment' },
  { id: 'ski_clothing', label: 'Ski clothing', group: 'Activity-specific' },
  { id: 'ski_goggles', label: 'Ski goggles', group: 'Activity-specific' },
  { id: 'helmet', label: 'Helmet', group: 'Activity-specific' },
  { id: 'fishing_equipment', label: 'Fishing equipment', group: 'Activity-specific' },
  { id: 'swimming_goggles', label: 'Swimming goggles', group: 'Activity-specific' },
  { id: 'dry_bag', label: 'Dry bag', group: 'Activity-specific' },
  { id: 'beach_towel', label: 'Beach towel', group: 'Activity-specific' },
  { id: 'cycling_clothing', label: 'Cycling clothing', group: 'Activity-specific' },
  { id: 'sports_shoes', label: 'Sports shoes', group: 'Activity-specific' },
  { id: 'personal_hygiene_items', label: 'Personal hygiene items', group: 'Activity-specific' },
] as const;

export const NOT_SUITABLE_FOR_CATALOG: readonly CatalogOption[] = [
  { id: 'wheelchair_users', label: 'Wheelchair users', group: 'Mobility' },
  { id: 'limited_mobility', label: 'People with limited mobility', group: 'Mobility' },
  { id: 'uneven_terrain', label: 'People unable to walk on uneven terrain', group: 'Mobility' },
  { id: 'cannot_climb_stairs', label: 'People who cannot climb stairs', group: 'Mobility' },
  { id: 'cannot_stand_long', label: 'People unable to stand for extended periods', group: 'Mobility' },
  { id: 'pregnant_travelers', label: 'Pregnant travelers', group: 'Health' },
  { id: 'back_problems', label: 'People with back problems', group: 'Health' },
  { id: 'heart_conditions', label: 'People with heart conditions', group: 'Health' },
  { id: 'motion_sickness', label: 'People prone to severe motion sickness', group: 'Health' },
  {
    id: 'activity_medical_restrictions',
    label: 'People with activity-specific medical restrictions',
    group: 'Health',
  },
] as const;

export const ACCESSIBILITY_FEATURES_CATALOG: readonly CatalogOption[] = [
  { id: 'wheelchair_accessible', label: 'Wheelchair accessible', group: 'Access' },
  { id: 'step_free_access', label: 'Step-free access', group: 'Access' },
  { id: 'elevator_access', label: 'Elevator access', group: 'Access' },
  { id: 'accessible_restroom', label: 'Accessible restroom', group: 'Access' },
  { id: 'accessible_parking', label: 'Accessible parking', group: 'Access' },
  { id: 'accessible_transportation', label: 'Accessible transportation', group: 'Support' },
  { id: 'seating_available', label: 'Seating available', group: 'Support' },
  { id: 'assistance_available', label: 'Assistance available', group: 'Support' },
  { id: 'suitable_reduced_mobility', label: 'Suitable for reduced mobility', group: 'Support' },
  { id: 'service_animals_permitted', label: 'Service animals permitted', group: 'Support' },
  { id: 'hearing_assistance', label: 'Hearing assistance available', group: 'Sensory' },
  { id: 'visual_assistance', label: 'Visual assistance available', group: 'Sensory' },
] as const;

/** Direct contradictions between “not suitable” and positive accessibility claims. */
export const ACCESSIBILITY_CONTRADICTIONS: ReadonlyArray<{ notSuitable: string; feature: string }> = [
  { notSuitable: 'wheelchair_users', feature: 'wheelchair_accessible' },
  { notSuitable: 'limited_mobility', feature: 'suitable_reduced_mobility' },
  { notSuitable: 'cannot_climb_stairs', feature: 'step_free_access' },
];

export type SpokenLanguageOption = { id: string; label: string; group: string };

export const SPOKEN_LANGUAGE_CATALOG: readonly SpokenLanguageOption[] = [
  { id: 'en', label: 'English', group: 'Common' },
  { id: 'fi', label: 'Finnish', group: 'Nordic & Baltic' },
  { id: 'sv', label: 'Swedish', group: 'Nordic & Baltic' },
  { id: 'no', label: 'Norwegian', group: 'Nordic & Baltic' },
  { id: 'da', label: 'Danish', group: 'Nordic & Baltic' },
  { id: 'et', label: 'Estonian', group: 'Nordic & Baltic' },
  { id: 'lv', label: 'Latvian', group: 'Nordic & Baltic' },
  { id: 'lt', label: 'Lithuanian', group: 'Nordic & Baltic' },
  { id: 'de', label: 'German', group: 'European' },
  { id: 'fr', label: 'French', group: 'European' },
  { id: 'es', label: 'Spanish', group: 'European' },
  { id: 'it', label: 'Italian', group: 'European' },
  { id: 'nl', label: 'Dutch', group: 'European' },
  { id: 'pt', label: 'Portuguese', group: 'European' },
  { id: 'pl', label: 'Polish', group: 'European' },
  { id: 'cs', label: 'Czech', group: 'European' },
  { id: 'sk', label: 'Slovak', group: 'European' },
  { id: 'hu', label: 'Hungarian', group: 'European' },
  { id: 'ro', label: 'Romanian', group: 'European' },
  { id: 'bg', label: 'Bulgarian', group: 'European' },
  { id: 'hr', label: 'Croatian', group: 'European' },
  { id: 'sr', label: 'Serbian', group: 'European' },
  { id: 'sl', label: 'Slovenian', group: 'European' },
  { id: 'el', label: 'Greek', group: 'European' },
  { id: 'tr', label: 'Turkish', group: 'European' },
  { id: 'ru', label: 'Russian', group: 'European' },
  { id: 'uk', label: 'Ukrainian', group: 'European' },
  { id: 'ja', label: 'Japanese', group: 'Asia & Middle East' },
  { id: 'zh', label: 'Chinese', group: 'Asia & Middle East' },
  { id: 'ko', label: 'Korean', group: 'Asia & Middle East' },
  { id: 'ar', label: 'Arabic', group: 'Asia & Middle East' },
  { id: 'hi', label: 'Hindi', group: 'Asia & Middle East' },
  { id: 'th', label: 'Thai', group: 'Asia & Middle East' },
  { id: 'vi', label: 'Vietnamese', group: 'Asia & Middle East' },
  { id: 'id', label: 'Indonesian', group: 'Asia & Middle East' },
] as const;

const WHAT_TO_BRING_IDS = new Set(WHAT_TO_BRING_CATALOG.map((o) => o.id));
const NOT_SUITABLE_IDS = new Set(NOT_SUITABLE_FOR_CATALOG.map((o) => o.id));
const ACCESSIBILITY_IDS = new Set(ACCESSIBILITY_FEATURES_CATALOG.map((o) => o.id));
const LANGUAGE_IDS = new Set(SPOKEN_LANGUAGE_CATALOG.map((o) => o.id));

export function filterValidCatalogIds(
  ids: readonly string[] | undefined | null,
  allowed: ReadonlySet<string>
): string[] {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw ?? '').trim();
    if (!id || !allowed.has(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

export function normalizeWhatToBringIds(ids: readonly string[] | undefined | null): string[] {
  return filterValidCatalogIds(ids, WHAT_TO_BRING_IDS);
}

export function normalizeNotSuitableForIds(ids: readonly string[] | undefined | null): string[] {
  return filterValidCatalogIds(ids, NOT_SUITABLE_IDS);
}

export function normalizeAccessibilityFeatureIds(ids: readonly string[] | undefined | null): string[] {
  return filterValidCatalogIds(ids, ACCESSIBILITY_IDS);
}

export function normalizeSpokenLanguageIds(ids: readonly string[] | undefined | null): string[] {
  return filterValidCatalogIds(ids, LANGUAGE_IDS);
}

export function labelsForCatalogIds(
  ids: readonly string[],
  catalog: readonly CatalogOption[] | readonly SpokenLanguageOption[]
): string[] {
  const map = new Map(catalog.map((o) => [o.id, o.label]));
  return ids.map((id) => map.get(id) ?? id).filter(Boolean);
}

export function accessibilityContradictionMessages(
  notSuitableIds: readonly string[],
  featureIds: readonly string[]
): string[] {
  const ns = new Set(notSuitableIds);
  const feat = new Set(featureIds);
  const out: string[] = [];
  for (const row of ACCESSIBILITY_CONTRADICTIONS) {
    if (ns.has(row.notSuitable) && feat.has(row.feature)) {
      const a = NOT_SUITABLE_FOR_CATALOG.find((o) => o.id === row.notSuitable)?.label ?? row.notSuitable;
      const b = ACCESSIBILITY_FEATURES_CATALOG.find((o) => o.id === row.feature)?.label ?? row.feature;
      out.push(`“${a}” conflicts with “${b}”. Remove one before publishing.`);
    }
  }
  return out;
}

/** Prefer winter items for tours; tickets lean documents; transport lean essentials. */
export function suggestedWhatToBringGroups(
  experienceKind: '' | 'tour' | 'ticket' | 'transportation'
): string[] {
  if (experienceKind === 'ticket') return ['Documents & essentials', 'General clothing'];
  if (experienceKind === 'transportation') return ['Documents & essentials', 'General clothing'];
  return ['Winter clothing', 'General clothing', 'Documents & essentials', 'Outdoor equipment', 'Activity-specific'];
}
