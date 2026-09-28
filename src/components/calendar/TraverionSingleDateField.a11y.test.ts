import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer A: marketplace / booking date triggers must expose the chosen date in the accessible name
 * (TravelerGuestPicker summary parity — not label-only "Check-in").
 */
describe('TraverionSingleDateField accessible naming', () => {
  it('labels the trigger with both field label and visible value', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'TraverionSingleDateField.tsx'),
      'utf8'
    );
    expect(src).toMatch(/const valueId = useId\(\)/);
    expect(src).toMatch(/aria-labelledby=\{\`\$\{labelId\} \$\{valueId\}\`\}/);
    expect(src).toMatch(/id=\{valueId\}/);
  });
});
