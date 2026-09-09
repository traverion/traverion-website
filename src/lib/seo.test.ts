import { describe, expect, it } from 'vitest';
import { publicStayPath, publicTourPath } from './seo';

describe('public listing SEO paths', () => {
  it('uses crawlable /tours and /stays deep links, not hash routes', () => {
    const tourId = 'c2d25217-84f0-46d4-8eaa-83949143fa06';
    const stayId = '83f88255-63ef-4824-93a2-89cc13244567';
    expect(publicTourPath(tourId)).toBe(`/tours/${tourId}`);
    expect(publicStayPath(stayId)).toBe(`/stays/${stayId}`);
    expect(publicTourPath(tourId)).not.toContain('#');
    expect(publicStayPath(stayId)).not.toContain('?');
  });
});
