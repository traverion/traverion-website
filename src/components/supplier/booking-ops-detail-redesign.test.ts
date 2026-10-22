import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Premium booking detail redesign', () => {
  it('shares presentation primitives across Tour and Stay details', () => {
    const primitives = readFileSync(resolve(__dirname, 'BookingOpsDetailPrimitives.tsx'), 'utf8');
    expect(primitives).toContain('BookingOpsExperience');
    expect(primitives).toContain('BookingOpsFinancePanel');
    expect(primitives).toContain('BookingOpsActionRail');
    expect(primitives).toContain('BookingOpsRuleList');
    expect(primitives).toContain('Message customer');

    const tour = readFileSync(resolve(__dirname, 'TourOpsBookingDetail.tsx'), 'utf8');
    const stay = readFileSync(resolve(__dirname, 'StayOpsBookingDetail.tsx'), 'utf8');
    expect(tour).toContain('BookingOpsExperience');
    expect(tour).toContain('Pickup time');
    expect(tour).toContain('privateNotesSlot');
    expect(stay).toContain('BookingOpsRuleList');
    expect(stay).toContain('tour-ops-detail__activity-dot');
    expect(stay).toContain('privateNotesSlot');
    expect(tour).not.toContain('font-display');
    expect(stay).not.toContain('font-display');
  });

  it('keeps sans-serif booking titles and compact detail chrome', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain(".tour-ops-detail__title");
    expect(css).toContain("Plus Jakarta Sans");
    expect(css).toContain('.tour-ops-detail__pickup-time');
    expect(css).toContain('.tour-ops-detail__rules-list');
    expect(css).toContain('.tour-ops-detail__activity-dot');
  });
});
