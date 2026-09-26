import { describe, expect, it } from 'vitest';
import {
  TRAVELER_TEST_MODE_DETAIL,
  TRAVELER_TEST_MODE_LABEL,
} from './traveler-env-presentation';

describe('traveler env presentation', () => {
  it('keeps Test mode banner copy short and non-marketing', () => {
    expect(TRAVELER_TEST_MODE_LABEL).toBe('Test mode');
    expect(TRAVELER_TEST_MODE_DETAIL.toLowerCase()).toContain('sandbox');
    expect(TRAVELER_TEST_MODE_DETAIL.toLowerCase()).not.toContain('stripe test until live');
    expect(TRAVELER_TEST_MODE_DETAIL.toLowerCase()).toContain('published inventory');
  });
});
