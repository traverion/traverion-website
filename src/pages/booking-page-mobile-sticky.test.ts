import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer A: mobile checkout dock must not widen the viewport (long totals / pay labels).
 */
describe('BookingPage mobile sticky bar overflow', () => {
  it('constrains the fixed dock and truncates sticky total copy', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'BookingPage.tsx'), 'utf8');
    expect(src).toMatch(/lg:hidden fixed inset-x-0 bottom-0[\s\S]*max-w-5xl/);
    expect(src).toMatch(
      /truncate text-sm text-ink-muted[\s\S]*font-semibold tabular-nums text-ink/
    );
  });
});
