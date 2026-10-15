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
    expect(css).toContain('.tv-cal-shell');
    expect(css).toContain('.tv-cal-toolbar');
  });

  it('wires SupplierAvailability cells to state classes', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierAvailability.tsx'), 'utf8');
    expect(src).toContain('tv-cal-day');
    expect(src).toContain('tv-cal-day--editing');
    expect(src).toContain('tv-cal-legend');
    expect(src).toContain('tv-cal-shell');
    expect(src).toContain('tv-avail-page-head');
    expect(src).toContain('tv-cal-drawer');
    expect(src).toContain('createPortal');
    expect(src).toContain('Manage availability');
    expect(src).toContain('Bulk edit availability');
    expect(src).toContain('tv-avail-modal-error');
    expect(src).toContain('TraverionSingleDateField');
    expect(src).toContain("view === 'agenda'");
    expect(src).toContain('AvailabilityAgendaView');
    expect(src).toContain('AvailabilityWeekView');
    expect(src).not.toContain('bg-emerald-50/80 ring-emerald-200/50');
  });

  it('defines viewport-anchored calendar drawer layout', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('.tv-cal-drawer-root');
    expect(css).toContain('.tv-cal-drawer__head');
    expect(css).toContain('.tv-cal-drawer__body');
    expect(css).toContain('.tv-cal-drawer__foot');
    expect(css).toContain('.tv-avail-modal-error');
    expect(css).toContain('.tv-date-sheet');
    expect(css).toContain('position: fixed');
  });
});
