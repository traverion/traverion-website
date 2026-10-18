import { describe, expect, it } from 'vitest';
import {
  quietHoursMentioned,
  stayScreenIndexFromStorage,
  stayStageBlocker,
  stayStageForLegacyWizardStep,
  type StayOnboardingCheck,
} from './stay-onboarding';

const ready: StayOnboardingCheck = {
  city: 'Rovaniemi',
  country: 'Finland',
  hasPlace: true,
  street: 'Koskikatu 12',
  postal: '96200',
  locationConfirmed: true,
  pinReady: true,
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
  exteriorCamera: false,
  safetyNote: '',
};

describe('stay onboarding screens', () => {
  it('restores a saved screen id and older numeric progress', () => {
    expect(stayScreenIndexFromStorage('photos', null)).toBeGreaterThan(10);
    expect(stayScreenIndexFromStorage(null, '6')).toBe(stayScreenIndexFromStorage('booking-method', null));
    expect(stayStageForLegacyWizardStep(5)).toBe(stayScreenIndexFromStorage('photos', null));
  });

  it('blocks an unconfirmed pin and a guest count the beds cannot sleep', () => {
    expect(stayStageBlocker('confirm', { ...ready, locationConfirmed: false })).toMatch(/correct location/);
    expect(stayStageBlocker('confirm', { ...ready, pinReady: false })).toMatch(/Place the pin/);
    expect(stayStageBlocker('guests', { ...ready, maxGuests: 6, sleepCapacity: 4 })).toMatch(/sleep 4/);
    expect(stayStageBlocker('price', ready)).toBeNull();
  });

  it('requires a camera location only when an exterior camera is disclosed', () => {
    expect(stayStageBlocker('safety', ready)).toBeNull();
    expect(stayStageBlocker('safety', { ...ready, exteriorCamera: true, safetyNote: 'Gate' })).toMatch(/exterior camera/);
  });

  it('reads quiet hours from written rules without applying them', () => {
    expect(quietHoursMentioned('Quiet hours between 22–06')).toEqual({ start: '22:00', end: '06:00' });
    expect(quietHoursMentioned('No parties')).toBeNull();
  });
});