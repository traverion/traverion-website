import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PUBLIC_DOCUMENT_TITLE, publicStayPath, publicTourPath } from './seo';

describe('public listing SEO paths', () => {
  it('uses crawlable /tours and /stays deep links, not hash routes', () => {
    const tourId = 'c2d25217-84f0-46d4-8eaa-83949143fa06';
    const stayId = '83f88255-63ef-4824-93a2-89cc13244567';
    expect(publicTourPath(tourId)).toBe(`/tours/${tourId}`);
    expect(publicStayPath(stayId)).toBe(`/stays/${stayId}`);
    expect(publicTourPath(tourId)).not.toContain('#');
    expect(publicStayPath(stayId)).not.toContain('?');
  });

  it('names the public marketplace as tours and stays, not tours-only', () => {
    expect(DEFAULT_PUBLIC_DOCUMENT_TITLE).toBe('Traverion – Tours and stays');
    expect(DEFAULT_PUBLIC_DOCUMENT_TITLE.toLowerCase()).toContain('stays');
  });

  it('clears browse listings JSON-LD on leave (parity with tour/stay PDP)', () => {
    const seo = readFileSync(resolve(process.cwd(), 'src/lib/seo.ts'), 'utf8');
    expect(seo).toMatch(/export function clearListingsJsonLd/);
    const packages = readFileSync(resolve(process.cwd(), 'src/pages/Packages.tsx'), 'utf8');
    expect(packages).toMatch(/return \(\) => clearListingsJsonLd\(\)/);
    expect(packages).toMatch(/seasonLiveListings\.length === 0[\s\S]*clearListingsJsonLd\(\)/);
  });
});
