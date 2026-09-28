import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1642: Sitemap Destination guides label', () => {
  it('labels the home destinations entry Destination guides', () => {
    const src = readFileSync(resolve(__dirname, 'Sitemap.tsx'), 'utf8');
    expect(src).toContain('Phase 1642');
    expect(src).toContain("label: 'Destination guides'");
    expect(src).not.toContain("label: 'Destinations'");
  });
});
