import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1811: calendar day-state visual language', () => {
  it('defines shared tv-cal-day state classes', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('Phase 1811');
    expect(css).toContain('.tv-cal-day--occupied');
    expect(css).toContain('.tv-cal-day--full');
    expect(css).toContain('.tv-cal-day--available');
    expect(css).toContain('.tv-cal-legend');
  });

  it('wires SupplierAvailability cells to state classes', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierAvailability.tsx'), 'utf8');
    expect(src).toContain('tv-cal-day');
    expect(src).toContain('tv-cal-day--editing');
    expect(src).toContain('tv-cal-legend');
    expect(src).not.toContain('bg-emerald-50/80 ring-emerald-200/50');
  });
});
