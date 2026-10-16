import { describe, expect, it } from 'vitest';
import { splitTravelerFullName } from './splitTravelerFullName';
import { travelerPasswordError } from './travelerPassword';

describe('traveler signup name and password', () => {
  it('keeps a single name and multi-part surnames', () => {
    expect(splitTravelerFullName('  Ada   Lovelace ')).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      displayName: 'Ada Lovelace',
    });
    expect(splitTravelerFullName('Mary Ann Smith')).toEqual({
      firstName: 'Mary',
      lastName: 'Ann Smith',
      displayName: 'Mary Ann Smith',
    });
    expect(splitTravelerFullName('Madonna').lastName).toBe('');
  });

  it('requires a letter and a number without rejecting a normal password', () => {
    expect(travelerPasswordError('short1')).toBeTruthy();
    expect(travelerPasswordError('longpassword')).toBeTruthy();
    expect(travelerPasswordError('traveler1')).toBeNull();
  });
});
