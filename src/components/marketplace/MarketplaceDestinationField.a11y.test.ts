import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer C: marketplace Where field must expose label + current text in the accessible name
 * (TraverionSingleDateField / TravelerGuestPicker summary parity).
 */
describe('MarketplaceDestinationField accessible naming', () => {
  it('labels the search input with field label and spoken value', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'MarketplaceSearchBar.tsx'),
      'utf8'
    );
    expect(src).toMatch(/export function MarketplaceDestinationField/);
    expect(src).toMatch(/const labelId = useId\(\)/);
    expect(src).toMatch(/const valueId = useId\(\)/);
    expect(src).toMatch(/aria-labelledby=\{\`\$\{labelId\} \$\{valueId\}\`\}/);
    expect(src).toMatch(/id=\{valueId\}/);
  });
});
