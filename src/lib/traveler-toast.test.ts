import { afterEach, describe, expect, it } from 'vitest';
import {
  TRAVELER_TOAST_COPY,
  armTravelerToast,
  resetTravelerToastsForTests,
  takeTravelerToast,
} from './traveler-toast';

describe('traveler auth toasts', () => {
  afterEach(() => {
    resetTravelerToastsForTests();
  });

  it('shows a login toast once, on the destination page', () => {
    armTravelerToast('login', 'bookings', 1_000);
    expect(takeTravelerToast('home', 1_100)).toBeNull();
    const shown = takeTravelerToast('bookings', 1_200);
    expect(shown?.title).toBe(TRAVELER_TOAST_COPY.login.title);
    expect(shown?.message).toBe("You're successfully logged in.");
    expect(takeTravelerToast('bookings', 1_300)).toBeNull();
  });

  it('ignores a duplicate arm for the same page', () => {
    armTravelerToast('welcome', 'home', 1_000);
    armTravelerToast('welcome', 'home', 1_100);
    expect(takeTravelerToast('home', 1_200)?.title).toBe('Welcome to Traverion!');
    expect(takeTravelerToast('home', 1_300)).toBeNull();
  });

  it('drops an expired toast instead of showing it later', () => {
    armTravelerToast('logout', 'home', 1_000);
    expect(takeTravelerToast('home', 1_000 + 8_001)).toBeNull();
  });

  it('keeps logout copy ready for the page after the session ends', () => {
    armTravelerToast('logout', 'packages', 5_000);
    expect(takeTravelerToast('account', 5_100)).toBeNull();
    expect(takeTravelerToast('packages', 5_200)?.message).toBe('See you on your next adventure.');
  });
});