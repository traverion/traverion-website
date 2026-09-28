import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1627: partner calendar legend a11y', () => {
  it('exposes the color legend with a group label instead of aria-hidden', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierAvailability.tsx'), 'utf8');
    expect(src).toContain('Phase 1627');
    expect(src).toContain("role=\"group\"");
    expect(src).toContain('Calendar legend:');
    expect(src).not.toMatch(/bg-paper px-3 py-2 text-\[11px\] text-ink-muted"\s*\n\s*aria-hidden/);
  });
});
