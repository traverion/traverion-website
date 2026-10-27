import type { RentalCategoryId, RentalDetails } from '../types/rental';

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
  /** Physical difficulty is meaningful for this product. Clothing and cameras leave it unused. */
  difficultyApplies: boolean;
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
      { key: 'brand', label: 'Gear / Equipment Brand', placeholder: 'e.g. Trek' },
      { key: 'model', label: 'Model line', placeholder: 'e.g. Rail' },
      { key: 'batteryRange', label: 'Battery / range (e-bikes)', placeholder: 'e.g. ~60 km assist' },
    ],
    variantAttributeKeys: [
      { key: 'size', label: 'Frame / size', placeholder: 'e.g. M' },
      { key: 'power', label: 'Power', placeholder: 'Electric or non-electric' },
    ],
    requirementKeys: [
      { key: 'minAge', label: 'Minimum age', placeholder: 'e.g. 16' },
      { key: 'experience', label: 'Experience notes', placeholder: 'e.g. Comfortable riding on flat paths' },
    ],
    inclusionSuggestions: ['Helmet', 'Lock', 'Charger', 'Lights'],
    difficultyApplies: true,
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
      { key: 'brand', label: 'Gear / Equipment Brand', placeholder: 'e.g. Halti' },
      { key: 'material', label: 'Material', placeholder: 'e.g. Merino wool' },
      { key: 'cleaningReturn', label: 'Cleaning / return notes', placeholder: 'e.g. Return dry, mud brushed off' },
    ],
    variantAttributeKeys: [{ key: 'size', label: 'Size', placeholder: 'S / M / L / XL' }],
    requirementKeys: [{ key: 'idRequiredNote', label: 'ID notes', placeholder: 'e.g. Passport or driving licence' }],
    inclusionSuggestions: ['Gloves', 'Hat', 'Socks'],
    difficultyApplies: false,
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
      { key: 'brand', label: 'Gear / Equipment Brand', placeholder: 'e.g. Atomic' },
    ],
    variantAttributeKeys: [
      { key: 'length', label: 'Length / size', placeholder: 'e.g. 160 cm' },
      { key: 'bootSize', label: 'Boot size', placeholder: 'When applicable' },
    ],
    requirementKeys: [{ key: 'minAge', label: 'Minimum age', placeholder: 'e.g. 8' }],
    inclusionSuggestions: ['Poles', 'Helmet', 'Goggles'],
    difficultyApplies: true,
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
      { key: 'brand', label: 'Gear / Equipment Brand', placeholder: 'e.g. Ski-Doo' },
      { key: 'model', label: 'Model', placeholder: 'e.g. Renegade' },
      { key: 'capacity', label: 'Passenger capacity', placeholder: 'e.g. 1–2 riders' },
    ],
    variantAttributeKeys: [{ key: 'modelTrim', label: 'Model / trim', placeholder: 'e.g. Adventure' }],
    requirementKeys: [
      { key: 'minAge', label: 'Minimum age', placeholder: 'e.g. 18' },
      { key: 'license', label: 'License requirements', placeholder: 'Describe what is required' },
      { key: 'experience', label: 'Experience / guide notes', placeholder: 'e.g. First time on a snowmobile is fine with a briefing' },
      { key: 'insuranceNote', label: 'Insurance disclosure', placeholder: 'e.g. You arrange damage cover at pickup' },
    ],
    inclusionSuggestions: ['Helmet', 'Safety briefing', 'Fuel for the rental period'],
    difficultyApplies: true,
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
    listingSpecKeys: [{ key: 'equipmentType', label: 'Equipment type', placeholder: 'e.g. Snowshoes for packed trails' }],
    variantAttributeKeys: [{ key: 'size', label: 'Size / variant', placeholder: 'e.g. 25 inch' }],
    requirementKeys: [{ key: 'minAge', label: 'Minimum age', placeholder: 'e.g. 16' }],
    inclusionSuggestions: ['Carrying bag', 'Instructions'],
    difficultyApplies: true,
  },
  cameras_electronics: {
    id: 'cameras_electronics',
    title: 'Cameras & electronics',
    description: 'Cameras, drones, and portable electronics.',
    itemTypes: [
      { id: 'camera', label: 'Camera' },
      { id: 'lens', label: 'Lens' },
      { id: 'drone', label: 'Drone' },
      { id: 'action_camera', label: 'Action camera' },
    ],
    allowCustomItemType: true,
    listingSpecKeys: [
      { key: 'brand', label: 'Gear / Equipment Brand', placeholder: 'e.g. Sony' },
      { key: 'model', label: 'Model', placeholder: 'e.g. Alpha 7 IV' },
    ],
    variantAttributeKeys: [
      { key: 'kit', label: 'Kit', placeholder: 'e.g. Body with a 24–70 mm lens' },
    ],
    requirementKeys: [
      { key: 'minAge', label: 'Minimum age', placeholder: 'e.g. 18' },
      { key: 'experience', label: 'Experience notes', placeholder: 'e.g. Comfortable changing a lens' },
    ],
    inclusionSuggestions: ['Battery', 'Charger', 'Memory card', 'Case'],
    difficultyApplies: false,
  },
  clothing_accessories: {
    id: 'clothing_accessories',
    title: 'Clothing & accessories',
    description: 'Apparel and accessories that are not winter-specific.',
    itemTypes: [
      { id: 'jacket', label: 'Jacket' },
      { id: 'footwear', label: 'Footwear' },
      { id: 'accessory', label: 'Accessory' },
      { id: 'outfit', label: 'Outfit' },
    ],
    allowCustomItemType: true,
    listingSpecKeys: [
      { key: 'brand', label: 'Gear / Equipment Brand', placeholder: 'e.g. Patagonia' },
      { key: 'material', label: 'Material', placeholder: 'e.g. Recycled nylon' },
    ],
    variantAttributeKeys: [{ key: 'size', label: 'Size', placeholder: 'e.g. M' }],
    requirementKeys: [{ key: 'minAge', label: 'Minimum age', placeholder: 'e.g. 12' }],
    inclusionSuggestions: ['Bag', 'Care instructions'],
    difficultyApplies: false,
  },
  vehicles: {
    id: 'vehicles',
    title: 'Vehicles',
    description: 'Cars, ATVs, and other vehicles that are not snowmobiles.',
    itemTypes: [
      { id: 'car', label: 'Car' },
      { id: 'atv', label: 'ATV' },
      { id: 'van', label: 'Van' },
    ],
    allowCustomItemType: true,
    listingSpecKeys: [
      { key: 'brand', label: 'Gear / Equipment Brand', placeholder: 'e.g. Polaris' },
      { key: 'model', label: 'Model', placeholder: 'e.g. Sportsman' },
      { key: 'capacity', label: 'Passenger capacity', placeholder: 'e.g. 4 seats' },
    ],
    variantAttributeKeys: [{ key: 'modelTrim', label: 'Model / trim', placeholder: 'e.g. Sport' }],
    requirementKeys: [
      { key: 'minAge', label: 'Minimum age', placeholder: 'e.g. 21' },
      { key: 'license', label: 'Licence requirements', placeholder: 'e.g. Full car licence held for two years' },
      { key: 'experience', label: 'Experience notes', placeholder: 'e.g. Used to driving on gravel roads' },
    ],
    inclusionSuggestions: ['Safety briefing', 'Basic insurance note from the operator'],
    difficultyApplies: true,
  },
};

const SHARED_RESTRICTIONS = [
  'No unauthorized modifications',
  'No subletting',
  'No unsafe or unlawful use',
];

/** Ideas the supplier can tap. Nothing here is saved until they select it. */
export function rentalHighlightSuggestions(id: RentalCategoryId | undefined): string[] {
  switch (id) {
    case 'bikes':
      return ['Helmet included', 'Lock included', 'Lights included', 'Charger for e-bikes', 'Several frame sizes'];
    case 'winter_clothing':
      return ['Several sizes', 'Insulated lining', 'Windproof outer', 'Easy to layer'];
    case 'skis_snowboards':
      return ['Boots available', 'Poles available', 'Several lengths', 'Bindings included'];
    case 'snowmobiles':
      return ['Helmet included', 'Safety briefing at pickup', 'One or two riders', 'Fuel for the rental period'];
    case 'outdoor_equipment':
      return ['Carrying bag included', 'Setup instructions included', 'Several sizes'];
    case 'cameras_electronics':
      return ['Battery included', 'Charger included', 'Memory card included', 'Protective case'];
    case 'clothing_accessories':
      return ['Several sizes', 'Care instructions included', 'Spare pieces available'];
    case 'vehicles':
      return ['Safety briefing at pickup', 'Several seats', 'Luggage space'];
    default:
      return [];
  }
}

export function rentalRestrictionSuggestions(id: RentalCategoryId | undefined): string[] {
  if (id === 'snowmobiles' || id === 'vehicles') {
    return [...SHARED_RESTRICTIONS, 'No use outside permitted areas', 'No prohibited off-road use'];
  }
  if (id === 'winter_clothing' || id === 'clothing_accessories') {
    return ['No alterations', 'Return items clean and dry', 'No unsafe or unlawful use'];
  }
  if (id === 'cameras_electronics') {
    return ['No unauthorized modifications', 'No subletting', 'No use in water unless stated'];
  }
  return SHARED_RESTRICTIONS;
}

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

/**
 * Switching category keeps compatible item types and drops fields that no longer
 * belong to the destination category (specs, requirements, option attributes).
 */
export function applyRentalCategoryChange(
  rental: RentalDetails,
  id: RentalCategoryId,
): Partial<RentalDetails> {
  const nextCfg = RENTAL_CATEGORY_CONFIG[id];
  const attrKeys = new Set(nextCfg.variantAttributeKeys.map((a) => a.key));
  const specKeys = new Set(nextCfg.listingSpecKeys.map((s) => s.key));
  const reqKeys = new Set(nextCfg.requirementKeys.map((r) => r.key));
  const keepItem =
    rental.itemType === 'custom' && nextCfg.allowCustomItemType
      ? 'custom'
      : nextCfg.itemTypes.some((t) => t.id === rental.itemType)
        ? rental.itemType
        : undefined;
  const variants = (rental.variants ?? []).map((v) => ({
    ...v,
    attributes: Object.fromEntries(Object.entries(v.attributes ?? {}).filter(([k]) => attrKeys.has(k))),
  }));
  return {
    category: id,
    itemType: keepItem,
    customItemType: keepItem === 'custom' ? rental.customItemType : undefined,
    specifications: Object.fromEntries(
      Object.entries(rental.specifications ?? {}).filter(
        ([k, v]) => k !== 'skillLevel' && specKeys.has(k) && String(v).trim(),
      ),
    ),
    skillSuitability: (rental.skillSuitability ?? rental.specifications?.skillLevel ?? '').trim() || undefined,
    requirements: Object.fromEntries(
      Object.entries(rental.requirements ?? {}).filter(([k, v]) => reqKeys.has(k) && String(v).trim()),
    ),
    variants,
    difficulty: nextCfg.difficultyApplies
      ? rental.difficulty === 'not_applicable'
        ? null
        : rental.difficulty
      : 'not_applicable',
  };
}
