import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Listing photo crop code-splitting', () => {
  it('lazy-loads ListingPhotoCropModal so react-easy-crop stays out of the editor shell', () => {
    const src = readFileSync(resolve(__dirname, 'ListingImageFields.tsx'), 'utf8');
    expect(src).toContain("import('./ListingPhotoCropModal')");
    expect(src).not.toMatch(/import \{ ListingPhotoCropModal \} from/);
  });
});
