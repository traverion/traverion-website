import { describe, expect, it } from 'vitest';
import {
  normalizeListingBookingOption,
  resolveOptionTravelerStartInstructions,
} from '../types/listingExtras';
import { bookingOptionMeetingIssues } from './listing-option-validation';
import {
  resolvePickupInstructionsForSnapshot,
  resolveOptionFieldsForSnapshot,
  buildPurchaseSnapshot,
} from '../../supabase/functions/_shared/purchase-snapshot.ts';
import { displayPickupInstructionsFromPurchase } from './purchase-snapshot';
import { resolveTourPickupMeetingDisplay } from './tour-pickup-meeting';
import type { TourPackage } from '../types/tour';

describe('Phase 1059: pickup place vs traveler start instructions', () => {
  it('keeps optionInfo as blurb and travelerStartInstructions as start copy', () => {
    const opt = normalizeListingBookingOption(
      {
        id: 'opt-1',
        name: 'Hotel pickup',
        priceUsd: 149,
        startTime: '20:00',
        duration: '4 hours',
        pickupPlace: 'Arctic City Hotel',
        optionInfo: 'Includes hotel pickup · English guide',
        travelerStartInstructions:
          'Please wait outside the main entrance 10 minutes before pickup. The guide will arrive in a marked vehicle.',
        minPersons: 1,
        maxPersons: 8,
        maxSpotsPerSlot: 8,
        weekdays: [true, true, true, true, true, true, true],
        fulfillment: 'pickup',
      },
      'opt-1'
    );
    expect(opt.optionInfo).toContain('English guide');
    expect(opt.travelerStartInstructions).toMatch(/marked vehicle/i);
    expect(opt.pickupPlace).toBe('Arctic City Hotel');
    expect(bookingOptionMeetingIssues(opt)).toEqual([]);
  });

  it('promotes legacy optionInfo into travelerStartInstructions on normalize', () => {
    const legacy = normalizeListingBookingOption(
      {
        id: 'opt-legacy',
        name: 'Meeting point',
        priceUsd: 99,
        startTime: '09:00',
        duration: '3 hours',
        pickupPlace: 'Maakuntakatu 29, Rovaniemi',
        optionInfo: 'Meet your guide outside the main entrance. Arrive 15 minutes early.',
        minPersons: 1,
        maxPersons: 8,
        maxSpotsPerSlot: 8,
        weekdays: [true, true, true, true, true, true, true],
        fulfillment: 'meeting_point',
      },
      'opt-legacy'
    );
    expect(legacy.travelerStartInstructions).toMatch(/15 minutes/i);
    expect(resolveOptionTravelerStartInstructions(legacy)).toMatch(/15 minutes/i);
  });

  it('freezes start instructions onto purchase_snapshot.pickupInstructions', () => {
    const fields = resolveOptionFieldsForSnapshot({
      listingExtras: {
        bookingOptions: [
          {
            id: 'opt-1',
            pickupPlace: 'Arctic City Hotel',
            optionInfo: 'Small group',
            travelerStartInstructions: 'Wait outside — marked van.',
            fulfillment: 'pickup',
            duration: '4 hours',
          },
        ],
      },
      optionId: 'opt-1',
    });
    const instructions = resolvePickupInstructionsForSnapshot({
      travelerStartInstructions: fields.travelerStartInstructions,
      optionInfo: fields.optionInfo,
      listingPickupInstructions: 'LIVE LISTING EDIT — must not win at checkout',
    });
    const snap = buildPurchaseSnapshot({
      listingTitle: 'Aurora',
      meetingPoint: fields.pickupPlace,
      pickupInstructions: instructions,
      capturedAt: '2026-09-27T12:00:00.000Z',
    });
    expect(snap.pickupInstructions).toBe('Wait outside — marked van.');
    expect(
      displayPickupInstructionsFromPurchase(snap, 'LIVE LISTING EDIT — must not win at checkout')
    ).toBe('Wait outside — marked van.');
  });

  it('PDP shows place and start instructions from the selected option', () => {
    const opt = normalizeListingBookingOption(
      {
        id: 'opt-meet',
        name: 'Meeting point',
        priceUsd: 99,
        startTime: '09:00',
        duration: '3 hours',
        pickupPlace: 'Maakuntakatu 29, Rovaniemi',
        optionInfo: 'Walk-up meeting',
        travelerStartInstructions:
          'Meet your guide outside the main entrance. Please arrive 15 minutes before departure.',
        minPersons: 1,
        maxPersons: 8,
        maxSpotsPerSlot: 8,
        weekdays: [true, true, true, true, true, true, true],
        fulfillment: 'meeting_point',
      },
      'opt-meet'
    );
    const pkg = {
      id: 't1',
      title: 'City walk',
      meetingPoint: 'Denormalized first option place',
      pickupInstructions: 'Denormalized first option note',
      listingExtras: { bookingOptions: [opt] },
    } as TourPackage;
    const d = resolveTourPickupMeetingDisplay(pkg, opt);
    expect(d.place).toBe('Maakuntakatu 29, Rovaniemi');
    expect(d.instructions).toMatch(/15 minutes before departure/i);
    expect(d.placeLabel).toBe('Meeting point');
  });

  it('blocks meeting scene when start instructions are missing', () => {
    const opt = normalizeListingBookingOption(
      {
        id: 'opt-thin',
        name: 'Hotel pickup',
        priceUsd: 149,
        startTime: '20:00',
        duration: '4 hours',
        pickupPlace: 'Arctic City Hotel',
        optionInfo: 'Includes hotel pickup',
        travelerStartInstructions: '',
        minPersons: 1,
        maxPersons: 8,
        maxSpotsPerSlot: 8,
        weekdays: [true, true, true, true, true, true, true],
        fulfillment: 'pickup',
      },
      'opt-thin'
    );
    // Explicit empty string must not re-seed from optionInfo.
    expect(opt.travelerStartInstructions).toBeUndefined();
    expect(bookingOptionMeetingIssues(opt).some((m) => /start instructions/i.test(m))).toBe(true);
  });
});
