import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('home catalog loading failure', () => {
  it('shows destinations an error with retry instead of the empty-catalog state', () => {
    const src = readFileSync(join(dir, 'Home.tsx'), 'utf8');
    const destinations = src.slice(src.indexOf('tv-home-destinations'));
    const errorAt = destinations.indexOf('Destinations unavailable');
    const emptyAt = destinations.indexOf('Operators are listing now');
    expect(errorAt).toBeGreaterThan(-1);
    expect(emptyAt).toBeGreaterThan(errorAt);
    expect(destinations).toMatch(/retry=\{\{ onClick: \(\) => reloadCatalog\(\) \}\}/);
  });

  it('uses the stays error copy for the stays section', () => {
    const src = readFileSync(join(dir, 'Home.tsx'), 'utf8');
    expect(src).toMatch(/title="Stays unavailable"[\s\S]*USER_ERROR\.stays/);
  });
});
