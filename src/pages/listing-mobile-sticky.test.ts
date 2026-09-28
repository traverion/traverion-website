import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer A: mobile booking dock must not widen the viewport (long totals / variant lines).
 */
describe('listing mobile sticky bar overflow', () => {
  it('TourDetails constrains and truncates sticky price copy', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'TourDetails.tsx'), 'utf8');
    expect(src).toMatch(/lg:hidden fixed inset-x-0 bottom-0[\s\S]*max-w-5xl[\s\S]*truncate text-sm font-semibold tabular-nums text-ink/);
  });

  it('StayDetails constrains and truncates sticky price copy', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'StayDetails.tsx'), 'utf8');
    expect(src).toMatch(/lg:hidden fixed inset-x-0 bottom-0[\s\S]*max-w-5xl[\s\S]*truncate text-sm text-ink/);
  });
});
