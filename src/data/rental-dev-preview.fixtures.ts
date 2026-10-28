/**
 * Development-only rental previews.
 * Not inserted into the database, not indexed as live inventory, and blocked from checkout.
 */
import { defaultRentalOperatingDays, migrateListingDurationToVariants } from '../lib/rental-details';
import type { ListingExtras } from '../types/listingExtras';
import type { TourPackage } from '../types/tour';
import type { RentalDetails, RentalOperatingDay, RentalVariant } from '../types/rental';

const photo = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1600&q=80`;

function days(patch?: (day: RentalOperatingDay) => RentalOperatingDay): RentalOperatingDay[] {
  return defaultRentalOperatingDays().map((day) => {
    const base = { ...day, open: day.day !== 'sun' };
    return patch ? patch(base) : base;
  });
}

function listing(
  id: string,
  title: string,
  city: string,
  image: string,
  description: string,
  rental: RentalDetails,
  photos: string[]
): TourPackage {
  const migrated = migrateListingDurationToVariants(rental);
  return {
    id,
    title,
    destination: `${city}, Finland`,
    duration: migrated.durationMode === 'hourly' ? 'Hourly' : 'Daily',
    style: 'rental',
    startLocation: migrated.pickupAddress ?? city,
    endLocation: migrated.returnAddress || migrated.pickupAddress || city,
    price: { startingFrom: 0, currency: 'EUR', perPerson: false, twinOccupancy: false, customQuote: false, singleSupplement: 0, validity: '' },
    category: '4*',
    tourType: 'adventure',
    validity: '',
    image,
    subtitle: migrated.shortIntro,
    description,
    highlights: migrated.highlights ?? [],
    itinerary: [],
    includes: migrated.inclusions ?? [],
    excludes: [],
    hotels: [],
    difficulty: 'Easy',
    groupSize: '',
    bestTime: '',
    rating: 0,
    reviews: 0,
    isPopular: false,
    city,
    country: 'Finland',
    status: 'published',
    isSeedData: true,
    listingExtras: {
      inventoryFamily: 'rental',
      rental: migrated,
      photoSlots: photos,
    } as ListingExtras & { photoSlots: string[] },
  };
}

function option(
  id: string,
  name: string,
  quantity: number,
  rates: { hour?: number; day?: number },
  attributes?: Record<string, string>
): RentalVariant {
  return {
    id,
    name,
    quantity,
    attributes,
    pricingOverride: {
      currency: 'EUR',
      pricePerHourMinor: rates.hour ?? null,
      pricePerDayMinor: rates.day ?? null,
    },
  };
}

const closedSunday = days((day) => (day.day === 'sun' ? { ...day, open: false } : day));

export const RENTAL_DEV_PREVIEW_LISTINGS: TourPackage[] = [
  listing(
    '00000000-0000-4000-8000-000000000001',
    'Rovaniemi city and electric bikes',
    'Rovaniemi',
    photo('photo-1485965120184-e220f721d03e'),
    'City bikes and e-bikes for the river paths. Each size keeps its own price and stock. Daily rentals run from the pickup date to the return date.',
    {
      category: 'bikes',
      itemType: 'electric_bike',
      shortIntro: 'City bikes and e-bikes, priced per day.',
      highlights: ['Helmet and lock included', 'Pickup beside the river'],
      specifications: { brand: 'Trek', model: 'FX and Rail' },
      pickupAddress: 'Koskikatu 12, 96200 Rovaniemi, Finland',
      pickupInstructions: 'The desk is inside the courtyard door marked Bikes. Ask for the rental shelf.',
      pickupLat: 66.5039,
      pickupLng: 25.7294,
      returnSameAsPickup: true,
      operatingDays: closedSunday,
      staffAssisted: true,
      returnStaffAssisted: true,
      idRequired: true,
      durationMode: 'daily',
      minDurationDays: 1,
      maxDurationDays: 7,
      calendarDayRentals: true,
      bufferMinutes: 60,
      bookingNoticeHours: 2,
      variants: [
        option('00000000-0000-4000-8000-000000000101', 'City bike · M', 6, { day: 1800 }, { size: 'M', power: 'Non-electric' }),
        option('00000000-0000-4000-8000-000000000102', 'E-bike · L', 2, { day: 4200 }, { size: 'L', power: 'Electric' }),
      ],
      inclusions: ['Helmet', 'Lock', 'Lights'],
      requirements: { minAge: '16', experience: 'Comfortable on flat cycle paths' },
      rentalRules: 'Return the bike locked. Off-road riding is not covered.',
      cancellationPreset: 'moderate_72h',
      depositRequired: true,
      depositAmountMinor: 5000,
      depositCurrency: 'EUR',
      depositCollectionMethod: 'card_at_pickup',
      depositReturnNotes: 'The operator returns the deposit after the bike is checked.',
    },
    [photo('photo-1485965120184-e220f721d03e'), photo('photo-1571068316344-75bc76f77890')]
  ),
  listing(
    '00000000-0000-4000-8000-000000000002',
    'Levi winter car and van',
    'Levi',
    photo('photo-1494976388531-d1058494cdd8'),
    'A compact car and a larger van. The van has its own daily price and only one unit in stock.',
    {
      category: 'vehicles',
      itemType: 'car',
      shortIntro: 'Car or van, priced per day.',
      highlights: ['Winter tyres', 'Pickup at the village desk'],
      specifications: { brand: 'Local fleet', capacity: 'Car 4 seats · van 7 seats' },
      pickupAddress: 'Levi Village, 99130 Kittilä, Finland',
      pickupInstructions: 'Collect the keys from the desk on the square. The vehicles are in the heated garage.',
      pickupLat: 67.804,
      pickupLng: 24.808,
      returnSameAsPickup: true,
      operatingDays: closedSunday,
      staffAssisted: true,
      returnStaffAssisted: true,
      idRequired: true,
      durationMode: 'daily',
      minDurationDays: 1,
      maxDurationDays: 10,
      calendarDayRentals: true,
      bufferMinutes: 120,
      bookingNoticeHours: 24,
      variants: [
        option('00000000-0000-4000-8000-000000000201', 'Compact car', 2, { day: 8900 }, { modelTrim: 'Winter tyres' }),
        option('00000000-0000-4000-8000-000000000202', 'Passenger van', 1, { day: 12900 }, { modelTrim: '7 seats' }),
      ],
      inclusions: ['Winter tyres', 'Basic insurance excess explained at pickup'],
      requirements: { minAge: '21', license: 'Valid driving licence held for at least 1 year' },
      rentalRules: 'Return with the same fuel level. Off-road driving is not allowed.',
      cancellationPreset: 'firm_7d',
      depositRequired: true,
      depositAmountMinor: 40000,
      depositCurrency: 'EUR',
      depositCollectionMethod: 'card_at_pickup',
      depositReturnNotes: 'Held by the operator, not by Traverion.',
    },
    [photo('photo-1494976388531-d1058494cdd8'), photo('photo-1527786356703-4b100091cd2c')]
  ),
  listing(
    '00000000-0000-4000-8000-000000000003',
    'Helsinki camera desk',
    'Helsinki',
    photo('photo-1516035069371-29a1b244cc32'),
    'Hourly camera rental. Same-day pickup and return. A body and a kit have different hourly prices.',
    {
      category: 'cameras_electronics',
      itemType: 'camera',
      shortIntro: 'Cameras by the hour.',
      highlights: ['Same-day return', 'Charged battery'],
      specifications: { brand: 'Sony' },
      pickupAddress: 'Fredrikinkatu 34, 00120 Helsinki, Finland',
      pickupInstructions: 'Second floor, bell marked Camera. Bring the card used for the deposit.',
      pickupLat: 60.164,
      pickupLng: 24.938,
      returnSameAsPickup: true,
      operatingDays: closedSunday,
      staffAssisted: true,
      returnStaffAssisted: true,
      idRequired: true,
      durationMode: 'hourly',
      minDurationHours: 2,
      maxDurationHours: 8,
      calendarDayRentals: true,
      bufferMinutes: 30,
      bookingNoticeHours: 1,
      variants: [
        option('00000000-0000-4000-8000-000000000301', 'Camera body', 3, { hour: 1200 }, { kit: 'Body only' }),
        option('00000000-0000-4000-8000-000000000302', 'Camera kit', 1, { hour: 1800 }, { kit: 'Body and 24–70 mm' }),
      ],
      inclusions: ['Charged battery', 'Strap'],
      requirements: { minAge: '18' },
      rentalRules: 'Do not change lenses outdoors in rain. Return the same day.',
      cancellationPreset: 'flexible_24h',
      depositRequired: true,
      depositAmountMinor: 20000,
      depositCurrency: 'EUR',
      depositCollectionMethod: 'card_at_pickup',
    },
    [photo('photo-1516035069371-29a1b244cc32')]
  ),
  listing(
    '00000000-0000-4000-8000-000000000004',
    'Saariselkä thermal overalls',
    'Saariselkä',
    photo('photo-1483664852095-d6cc6870702d'),
    'Winter clothing by size. Each size has its own daily price and stock.',
    {
      category: 'winter_clothing',
      itemType: 'thermal_overall',
      shortIntro: 'Thermal overalls, priced per day.',
      specifications: { brand: 'Halti', material: 'Insulated shell' },
      pickupAddress: 'Saariseläntie 7, 99830 Saariselkä, Finland',
      pickupInstructions: 'The clothing rail is at the back of the ski service room.',
      pickupLat: 68.419,
      pickupLng: 27.412,
      returnSameAsPickup: true,
      operatingDays: closedSunday,
      staffAssisted: false,
      returnStaffAssisted: false,
      idRequired: false,
      durationMode: 'daily',
      minDurationDays: 1,
      maxDurationDays: 5,
      calendarDayRentals: true,
      bufferMinutes: 0,
      bookingNoticeHours: 0,
      variants: [
        option('00000000-0000-4000-8000-000000000401', 'Overall · S', 4, { day: 2500 }, { size: 'S' }),
        option('00000000-0000-4000-8000-000000000402', 'Overall · M', 8, { day: 2500 }, { size: 'M' }),
        option('00000000-0000-4000-8000-000000000403', 'Overall · L', 3, { day: 2900 }, { size: 'L' }),
      ],
      inclusions: ['Gloves'],
      rentalRules: 'Return the overall dry. Brush off snow before you come inside.',
      cancellationPreset: 'moderate_72h',
      depositRequired: false,
    },
    [photo('photo-1483664852095-d6cc6870702d')]
  ),
  listing(
    '00000000-0000-4000-8000-000000000005',
    'Nuuksio camping kit',
    'Espoo',
    photo('photo-1504280390367-361c6d9f38f4'),
    'Tents and snowshoes. The tent stock is two units. Snowshoes are a separate option.',
    {
      category: 'outdoor_equipment',
      itemType: 'camping',
      shortIntro: 'Camping kit and snowshoes, priced per day.',
      pickupAddress: 'Nuuksio nature centre, 02820 Espoo, Finland',
      pickupInstructions: 'Collect from the service window before it closes. The kit is packed in a numbered bag.',
      pickupLat: 60.311,
      pickupLng: 24.544,
      returnSameAsPickup: false,
      returnAddress: 'Haltia, 02820 Espoo, Finland',
      returnInstructions: 'Leave the bag at the Haltia side entrance if the window is closed.',
      returnLat: 60.307,
      returnLng: 24.537,
      operatingDays: closedSunday,
      durationMode: 'daily',
      minDurationDays: 2,
      maxDurationDays: 4,
      calendarDayRentals: true,
      bufferMinutes: 180,
      bookingNoticeHours: 12,
      variants: [
        option('00000000-0000-4000-8000-000000000501', 'Two-person tent', 2, { day: 3500 }),
        option('00000000-0000-4000-8000-000000000502', 'Snowshoes', 10, { day: 1500 }),
      ],
      inclusions: ['Stuff sack', 'Repair patch'],
      requirements: { minAge: '18' },
      rentalRules: 'Pack the tent dry. Report a broken pole at return.',
      cancellationPreset: 'moderate_72h',
      depositRequired: true,
      depositAmountMinor: 8000,
      depositCurrency: 'EUR',
      depositCollectionMethod: 'cash_at_pickup',
    },
    [photo('photo-1504280390367-361c6d9f38f4')]
  ),
  listing(
    '00000000-0000-4000-8000-000000000006',
    'Pyhä ski and snowboard sets',
    'Pyhä',
    photo('photo-1551698618-1dfe5d97d256'),
    'Hourly or daily sets. The snowboard and the ski set have different rates. Stock is separate.',
    {
      category: 'skis_snowboards',
      itemType: 'complete_set',
      shortIntro: 'Skis or a snowboard, by the hour or the day.',
      specifications: { brand: 'Atomic' },
      pickupAddress: 'Pyhä ski resort, 98530 Pyhätunturi, Finland',
      pickupInstructions: 'Rental counter on the ground floor, left of the ticket machines.',
      pickupLat: 67.014,
      pickupLng: 27.221,
      returnSameAsPickup: true,
      operatingDays: days((day) =>
        day.day === 'sun'
          ? { ...day, open: true, earliestPickupHm: '10:00', latestPickupHm: '15:00', earliestReturnHm: '10:00', latestReturnHm: '16:00' }
          : day
      ),
      durationMode: 'both',
      minDurationHours: 2,
      maxDurationHours: 6,
      minDurationDays: 1,
      maxDurationDays: 3,
      calendarDayRentals: true,
      bufferMinutes: 30,
      bookingNoticeHours: 1,
      variants: [
        option('00000000-0000-4000-8000-000000000601', 'Ski set · 160 cm', 5, { hour: 900, day: 3900 }, { length: '160 cm' }),
        option('00000000-0000-4000-8000-000000000602', 'Snowboard · 152 cm', 2, { hour: 1100, day: 4500 }, { length: '152 cm' }),
      ],
      inclusions: ['Poles with the ski set', 'Helmet'],
      requirements: { minAge: '8' },
      rentalRules: 'Stay on marked slopes. Return boots with the set.',
      cancellationPreset: 'flexible_24h',
      depositRequired: true,
      depositAmountMinor: 10000,
      depositCurrency: 'EUR',
      depositCollectionMethod: 'card_at_pickup',
    },
    [photo('photo-1551698618-1dfe5d97d256')]
  ),
];
