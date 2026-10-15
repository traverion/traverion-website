import { describe, expect, it } from 'vitest';
import {
  CONSUMER_BOOKING_COL,
  CONSUMER_CONTENT_MAX,
  CONSUMER_FINLAND,
  CONSUMER_INK,
  CONSUMER_PAPER,
  CONSUMER_PDP_MAX,
} from './consumerExperience';

describe('consumer experience measure', () => {
  it('keeps detail pages narrower than a stretched 90rem canvas', () => {
    const pdp = Number.parseFloat(CONSUMER_PDP_MAX);
    const content = Number.parseFloat(CONSUMER_CONTENT_MAX);
    expect(pdp).toBeLessThan(90);
    expect(content).toBeLessThanOrEqual(pdp);
    expect(CONSUMER_BOOKING_COL.endsWith('rem')).toBe(true);
  });

  it('uses a white canvas and the existing brand ink and blue', () => {
    expect(CONSUMER_PAPER).toBe('#ffffff');
    expect(CONSUMER_INK).toBe('#1c1917');
    expect(CONSUMER_FINLAND).toBe('#003580');
  });
});
