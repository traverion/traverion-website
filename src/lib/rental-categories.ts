import type { RentalCategoryId } from '../types/rental';

export type RentalCategoryConfig = {
  id: RentalCategoryId;
  title: string;
  description: string;
  itemTypes: { id: string; label: string }[];
  allowCustomItemType: boolean;
  /** Spec keys shown on the listing-level specifications screen. */
  listingSpecKeys: { key: string; label: string; placeholder?: string }[];
  /** Attribute keys for the option editor. */
  variantAttributeKeys: { key: string; label: string; placeholder?: string }[];
  requirementKeys: { key: string; label: string; placeholder?: string }[];
  inclusionSuggestions: string[];
};

export const RENTAL_CATEGORY_CONFIG: Record<RentalCategoryId, RentalCategoryConfig> = {
  bikes: {
    id: 'bikes',
    title: 'Bikes & e-bikes',
    description: 'Electric bikes, fat bikes, mountain bikes, and city bikes.',
    itemTypes: [
      { id: 'electric_bike', label: 'Electric bike' },
      { id: 'standard_bicycle', label: 'Standard bicycle' },
      { id: 'fat_bike', label: 'Fat bike' },
      { id: 'mountain_bike', label: 'Mountain bike' },
    ],
    allowCustomItemType: true,
    listingSpecKeys: [
      { key: 'brand', label: 'Brand', placeholder: 'e.g. Trek' },
      { key: 'model', label: 'Model line', placeholder: 'Optional' },
      { key: 'batteryRange', label: 'Battery / range (e-bikes)', placeholder: 'e.g. ~60 km assist' },
    ],
    variantAttributeKeys: [
      { key: 'size', label: 'Frame / size', placeholder: 'e.g. M' },
      { key: 'power', label: 'Power', placeholder: 'Electric or non-electric' },
    ],
    requirementKeys: [
      { key: 'minAge', label: 'Minimum age', placeholder: 'e.g. 16' },
      { key: 'experience', label: 'Experience notes', placeholder: 'Optional' },
    ],
    inclusionSuggestions: ['Helmet', 'Lock', 'Charger', 'Lights'],
  },
  winter_clothing: {
    id: 'winter_clothing',
    title: 'Winter clothing',
    description: 'Thermal overalls, jackets, boots, and clothing sets.',
    itemTypes: [
      { id: 'thermal_overall', label: 'Thermal overall' },
      { id: 'winter_jacket', label: 'Winter jacket' },
      { id: 'winter_boots', label: 'Winter boots' },
      { id: 'clothing_set', label: 'Complete clothing set' },
    ],
    allowCustomItemType: true,
    listingSpecKeys: [
      { key: 'brand', label: 'Brand', placeholder: 'Optional' },
      { key: 'material', label: 'Material', placeholder: 'Optional' },
      { key: 'cleaningReturn', label: 'Cleaning / return notes', placeholder: 'How items should be returned' },
    ],
    variantAttributeKeys: [{ key: 'size', label: 'Size', placeholder: 'S / M / L / XL' }],
    requirementKeys: [{ key: 'idRequiredNote', label: 'ID notes', placeholder: 'Optional' }],
    inclusionSuggestions: ['Gloves', 'Hat', 'Socks'],
  },
  skis_snowboards: {
    id: 'skis_snowboards',
    title: 'Skis & snowboards',
    description: 'Skis, snowboards, boots, and complete sets.',
    itemTypes: [
      { id: 'skis', label: 'Skis' },
      { id: 'snowboard', label: 'Snowboard' },
      { id: 'ski_boots', label: 'Ski boots' },
      { id: 'complete_set', label: 'Complete equipment set' },
    ],
    allowCustomItemType: true,
    listingSpecKeys: [
      { key: 'brand', label: 'Brand', placeholder: 'Optional' },
      { key: 'skillLevel', label: 'Skill suitability', placeholder: 'e.g. Beginner to intermediate' },
    ],
    variantAttributeKeys: [
      { key: 'length', label: 'Length / size', placeholder: 'e.g. 160 cm' },
      { key: 'bootSize', label: 'Boot size', placeholder: 'When applicable' },
    ],
    requirementKeys: [{ key: 'minAge', label: 'Minimum age', placeholder: 'Optional' }],
    inclusionSuggestions: ['Poles', 'Helmet', 'Goggles'],
  },
  snowmobiles: {
    id: 'snowmobiles',
    title: 'Snowmobiles & recreational vehicles',
    description: 'Snowmobiles and similar recreational vehicles.',
    itemTypes: [
      { id: 'snowmobile', label: 'Snowmobile' },
      { id: 'recreational_vehicle', label: 'Other recreational vehicle' },
    ],
    allowCustomItemType: true,
    listingSpecKeys: [
      { key: 'brand', label: 'Brand', placeholder: 'Optional' },
      { key: 'model', label: 'Model', placeholder: 'Optional' },
      { key: 'capacity', label: 'Passenger capacity', placeholder: 'e.g. 1–2 riders' },
    ],
    variantAttributeKeys: [{ key: 'modelTrim', label: 'Model / trim', placeholder: 'Optional' }],
    requirementKeys: [
      { key: 'minAge', label: 'Minimum age', placeholder: 'e.g. 18' },
      { key: 'license', label: 'License requirements', placeholder: 'Describe what is required' },
      { key: 'experience', label: 'Experience / guide notes', placeholder: 'Optional' },
      { key: 'insuranceNote', label: 'Insurance disclosure', placeholder: 'What coverage applies — configurable only' },
    ],
    inclusionSuggestions: ['Helmet', 'Safety briefing', 'Fuel for the rental period'],
  },
  outdoor_equipment: {
    id: 'outdoor_equipment',
    title: 'Other outdoor equipment',
    description: 'Camping, snowshoes, and other outdoor gear.',
    itemTypes: [
      { id: 'snowshoes', label: 'Snowshoes' },
      { id: 'camping', label: 'Camping gear' },
      { id: 'other', label: 'Other outdoor equipment' },
    ],
    allowCustomItemType: true,
    listingSpecKeys: [{ key: 'equipmentType', label: 'Equipment type', placeholder: 'Describe the gear' }],
    variantAttributeKeys: [{ key: 'size', label: 'Size / variant', placeholder: 'Optional' }],
    requirementKeys: [{ key: 'minAge', label: 'Minimum age', placeholder: 'Optional' }],
    inclusionSuggestions: ['Carrying bag', 'Instructions'],
  },
};

export function rentalCategoryConfig(id: RentalCategoryId | undefined): RentalCategoryConfig | null {
  if (!id) return null;
  return RENTAL_CATEGORY_CONFIG[id] ?? null;
}

export function rentalItemTypeLabel(category: RentalCategoryId | undefined, itemType: string | undefined): string {
  if (!category || !itemType) return '';
  const cfg = RENTAL_CATEGORY_CONFIG[category];
  const hit = cfg.itemTypes.find((t) => t.id === itemType);
  return hit?.label ?? itemType;
}
