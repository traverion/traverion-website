import { describe, expect, it } from 'vitest';
import { travelerDisplayNameFromSources } from './traveler-display-name';

describe('travelerDisplayNameFromSources', () => {
  it('prefers form, then profile, then metadata — never email local-part', () => {
    expect(
      travelerDisplayNameFromSources({
        formValue: 'Anna Korhonen',
        profileDisplayName: 'Profile Name',
        metadata: { full_name: 'Meta Name' },
      })
    ).toBe('Anna Korhonen');
    expect(
      travelerDisplayNameFromSources({
        profileDisplayName: 'Profile Name',
        metadata: { full_name: 'Meta Name' },
      })
    ).toBe('Profile Name');
    expect(
      travelerDisplayNameFromSources({
        metadata: { customer_first_name: 'Sofia', customer_last_name: 'Laine' },
      })
    ).toBe('Sofia Laine');
    expect(travelerDisplayNameFromSources({})).toBe('Guest');
  });
});
