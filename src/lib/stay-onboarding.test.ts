import { describe, expect, it } from 'vitest';
import { stayStageBlocker, stayStageForLegacyWizardStep, type StayOnboardingCheck } from './stay-onboarding';

const ready: StayOnboardingCheck = {
  city: 'Rovaniemi',
  country: 'Finland',
  hasPlace: true,
  street: 'Koskikatu 12',
  postal: '96200',
  locationConfirmed: true,
  title: 'Quiet apartment by the river',
  propertyType: 'Apartment',
  areasWithBeds: 1,
  maxGuests: 4,
  minNights: 2,
  maxNights: 14,
  sleepCapacity: 4,
  nightly: 120,
  checkIn: '16:00',
  checkOut: '11:00',
  arrivalMethod: 'lockbox',
  photoCount: 3,
  address: 'Koskikatu 12, 96200 Rovaniemi',
  rulesChosen: true,
  descriptionLength: 120,
  minDescription: 100,
  minTitle: 10,
};

describe('stay onboarding stages', () => {
  it('maps the older wizard steps onto the fifteen-stage flow', () => {
    expect(stayStageForLegacyWizardStep(0)).toBe(0);
    expect(stayStageForLegacyWizardStep(5)).toBe(11);
    expect(stayStageForLegacyWizardStep(7)).toBe(13);
  });

  it('blocks an unconfirmed pin and a guest count the beds cannot sleep', () => {
    expect(stayStageBlocker(1, { ...ready, locationConfirmed: false })).toMatch(/Confirm the pin/);
    expect(stayStageBlocker(8, { ...ready, maxGuests: 6, sleepCapacity: 4 })).toMatch(/sleep 4/);
    expect(stayStageBlocker(9, ready)).toBeNull();
  });

  it('does not treat request-to-book or a custom cancellation policy as a required stage', () => {
    expect(stayStageBlocker(6, ready)).toBeNull();
    expect(stayStageBlocker(12, ready)).toBeNull();
  });
});