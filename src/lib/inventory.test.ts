import { describe, expect, it } from 'vitest';
import {
  INVENTORY_AVAILABILITY_UNIT,
  INVENTORY_FAMILIES,
  LIVE_INVENTORY_FAMILIES,
  MARKETPLACE_PRIMITIVES,
  PARTNER_CREATE_INVENTORY,
  availabilityUnitForListing,
  filterTravelerCatalog,
  inventoryFamilyFromListing,
  listingCanUseTravelerQuote,
  listingIsOnTravelerCatalog,
  reservedInventoryFamilyFromPath,
} from './inventory';

describe('inventory families', () => {
  it('keeps tours, stays, rentals, experiences, and packages as five families', () => {
    expect([...INVENTORY_FAMILIES]).toEqual(['tour', 'stay', 'rental', 'experience', 'package']);
    expect(new Set(Object.values(INVENTORY_AVAILABILITY_UNIT)).size).toBe(5);
    expect(INVENTORY_AVAILABILITY_UNIT.tour).toBe('tour_departure');
    expect(INVENTORY_AVAILABILITY_UNIT.stay).toBe('stay_night');
    expect(INVENTORY_AVAILABILITY_UNIT.rental).toBe('rental_interval');
    expect(INVENTORY_AVAILABILITY_UNIT.package).toBe('package_itinerary');
    expect(INVENTORY_AVAILABILITY_UNIT.experience).toBe('experience_slot');
  });

  it('only publishes tours and stays to travelers', () => {
    expect([...LIVE_INVENTORY_FAMILIES]).toEqual(['tour', 'stay']);
    expect(listingIsOnTravelerCatalog({})).toBe(true);
    expect(listingIsOnTravelerCatalog({ isHolidayPackage: true })).toBe(false);
    expect(listingIsOnTravelerCatalog({ listingExtras: { inventoryFamily: 'stay' } })).toBe(true);
    expect(listingIsOnTravelerCatalog({ listingExtras: { inventoryFamily: 'rental' } })).toBe(false);
    expect(listingIsOnTravelerCatalog({ listingExtras: { inventoryFamily: 'experience' } })).toBe(false);
  });

  it('does not treat operator experience_kind as the Experiences category', () => {
    expect(inventoryFamilyFromListing({ experienceKind: 'ticket' })).toBe('tour');
    expect(inventoryFamilyFromListing({ experienceKind: 'transportation' })).toBe('tour');
    expect(inventoryFamilyFromListing({ listingExtras: { inventoryFamily: 'experience' } })).toBe(
      'experience',
    );
  });

  it('quotes only live tour departures', () => {
    expect(listingCanUseTravelerQuote({})).toBe(true);
    expect(availabilityUnitForListing({})).toBe('tour_departure');
    expect(listingCanUseTravelerQuote({ listingExtras: { inventoryFamily: 'stay' } })).toBe(false);
    expect(listingCanUseTravelerQuote({ listingExtras: { inventoryFamily: 'rental' } })).toBe(false);
    expect(
      filterTravelerCatalog([
        { id: 't' },
        { id: 's', listingExtras: { inventoryFamily: 'stay' } },
        { id: 'r', listingExtras: { inventoryFamily: 'rental' } },
        { id: 'e', listingExtras: { inventoryFamily: 'experience' } },
      ]).map((l) => (l as { id: string }).id),
    ).toEqual(['t', 's']);
  });

  it('keeps experience and rental URLs reserved, and partner can create tour, stay, rental', () => {
    expect(reservedInventoryFamilyFromPath('/stays')).toBeNull();
    expect(reservedInventoryFamilyFromPath('/experiences')).toBe('experience');
    expect(reservedInventoryFamilyFromPath('/rentals')).toBe('rental');
    expect(reservedInventoryFamilyFromPath('/packages')).toBeNull();
    expect(PARTNER_CREATE_INVENTORY.filter((o) => o.canCreate).map((o) => o.family)).toEqual([
      'tour',
      'stay',
      'rental',
    ]);
    expect(PARTNER_CREATE_INVENTORY.some((o) => o.family === 'experience')).toBe(false);
    expect(MARKETPLACE_PRIMITIVES).toEqual([
      'listing',
      'booking',
      'availability',
      'money',
      'business',
      'customer',
    ]);
  });
});
