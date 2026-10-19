import { describe, expect, it } from 'vitest';
import {
  STAY_ONBOARDING_SCREENS,
  clampStayIntroInput,
  quietHoursMentioned,
  stayScreenIndex,
  stayScreenIndexForPublishLine,
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
  maxTitle: 65,
  subtitle: 'A calm apartment beside the river, with a sauna for late evenings.',
  maxSubtitle: 300,
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
  cameraLocation: '',
  safetyNote: '',
};

describe('stay onboarding screens', () => {
  it('splits the property name and introduction into 27 screens', () => {
    expect(STAY_ONBOARDING_SCREENS).toHaveLength(27);
    expect(STAY_ONBOARDING_SCREENS.find((screen) => screen.id === 'property-type')?.part).toBe('1 of 3');
    expect(STAY_ONBOARDING_SCREENS.find((screen) => screen.id === 'property-name')?.part).toBe('2 of 3');
    expect(STAY_ONBOARDING_SCREENS.find((screen) => screen.id === 'property-intro')?.part).toBe('3 of 3');
    expect(stayScreenIndex('property-intro')).toBe(stayScreenIndex('property-name') + 1);
    expect(stayScreenIndexFromStorage('property-name', null)).toBe(stayScreenIndex('property-name'));
    expect(stayScreenIndexFromStorage('property-intro', null)).toBe(stayScreenIndex('property-intro'));
    expect(stayScreenIndexFromStorage('amenities', null)).toBe(stayScreenIndex('amenities'));
    expect(stayScreenIndexFromStorage(null, '3')).toBe(stayScreenIndex('amenities'));
    expect(new Set(STAY_ONBOARDING_SCREENS.map((screen) => screen.id)).size).toBe(27);
    expect(stayScreenIndexForPublishLine('Add a subtitle (short line under the title) so guests quickly understand the offer.')).toBe(
      stayScreenIndex('property-intro')
    );
    const saved = 'A'.repeat(320);
    expect(clampStayIntroInput(saved, saved, 300)).toBe(saved);
    expect(clampStayIntroInput('A'.repeat(320), 'Short intro', 300)).toHaveLength(300);
    expect(stayStageBlocker('property-name', ready)).toBeNull();
    expect(stayStageBlocker('property-name', { ...ready, title: 'Too short' })).toMatch(/10/);
    expect(stayStageBlocker('property-intro', ready)).toBeNull();
    expect(stayStageBlocker('property-intro', { ...ready, subtitle: '' })).toMatch(/introduction/);
    expect(stayStageBlocker('property-intro', { ...ready, subtitle: 'A'.repeat(301) })).toMatch(/300/);
  });

  it('restores a saved screen id and older numeric progress', () => {
    expect(stayScreenIndexFromStorage('photos', null)).toBeGreaterThan(10);
    expect(stayScreenIndexFromStorage(null, '6')).toBe(stayScreenIndexFromStorage('booking-method', null));
    expect(stayStageForLegacyWizardStep(5)).toBe(stayScreenIndexFromStorage('photos', null));
  });

  it('keeps a named property type and asks for a custom type when Other is empty', () => {
    expect(stayStageBlocker('property-type', ready)).toBeNull();
    expect(stayStageBlocker('property-type', { ...ready, propertyType: 'Villa' })).toBeNull();
    expect(stayStageBlocker('property-type', { ...ready, propertyType: 'Glass igloo' })).toBeNull();
    expect(stayStageBlocker('property-type', { ...ready, propertyType: 'Other' })).toMatch(/Specify/);
    expect(stayStageBlocker('property-type', { ...ready, propertyType: 'A' })).toMatch(/Specify/);
    expect(stayStageBlocker('property-type', { ...ready, propertyType: '' })).toMatch(/Choose a property type/);
  });

  it('requires a selected address rather than an empty street', () => {
    expect(stayStageBlocker('location', ready)).toBeNull();
    expect(stayStageBlocker('location', { ...ready, street: '12' })).toMatch(/suggestions/);
    expect(stayStageBlocker('location', { ...ready, postal: '' })).toMatch(/suggestions/);
  });

  it('blocks an unconfirmed pin and a guest count the beds cannot sleep', () => {
    expect(stayStageBlocker('confirm', { ...ready, locationConfirmed: false })).toMatch(/correct location/);
    expect(stayStageBlocker('confirm', ready)).toBeNull();
    expect(stayStageBlocker('confirm', { ...ready, pinReady: false })).toMatch(/Place the pin/);
    expect(stayStageBlocker('guests', { ...ready, maxGuests: 6, sleepCapacity: 4 })).toMatch(/sleep 4/);
    expect(stayStageBlocker('price', ready)).toBeNull();
  });

  it('requires a camera location only when an exterior camera is disclosed', () => {
    expect(stayStageBlocker('safety', ready)).toBeNull();
    expect(stayStageBlocker('safety', { ...ready, exteriorCamera: true, cameraLocation: 'Gate' })).toMatch(/exterior camera/);
    expect(
      stayStageBlocker('safety', {
        ...ready,
        exteriorCamera: true,
        cameraLocation: 'Outside the main entrance',
      })
    ).toBeNull();
  });

  it('reads quiet hours from written rules without applying them', () => {
    expect(quietHoursMentioned('Quiet hours between 22–06')).toEqual({ start: '22:00', end: '06:00' });
    expect(quietHoursMentioned('No parties')).toBeNull();
  });
});