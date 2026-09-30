import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1753: Availability day Clear/Save gated for finance', () => {
  it('clearCap and day-sheet actions require canEditCalendar', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierAvailability.tsx'), 'utf8');
    expect(src).toContain('Phase 1753');
    expect(src).toContain('clearCap');
    expect(src).toMatch(/const clearCap[\s\S]*?if \(!canEditCalendar\)/);
    expect(src).toContain('disabled={!canEditCalendar || savingIso === editing.iso}');
  });
});
