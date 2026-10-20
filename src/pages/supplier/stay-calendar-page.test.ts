import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Stay Calendar page contracts', () => {
  it('wires Stay Calendar into partner layout and live nav', () => {
    const layout = readFileSync(join(root, 'components/supplier/SupplierLayout.tsx'), 'utf8');
    const nav = readFileSync(join(root, 'lib/partnerNav.ts'), 'utf8');
    expect(layout).toContain("import('../../pages/supplier/SupplierStayCalendar')");
    expect(layout).toContain("section === 'stay-calendar'");
    expect(layout).toContain('/stay-calendar');
    expect(nav).toContain("id: 'stay-calendar'");
    expect(nav).not.toMatch(/stay-calendar[\s\S]{0,80}comingSoon:\s*true/);
  });

  it('keeps inventory rules: unpaid Instant Book never blocks; blocks use capacity 0', () => {
    const page = readFileSync(join(root, 'pages/supplier/SupplierStayCalendar.tsx'), 'utf8');
    const model = readFileSync(join(root, 'lib/stay-calendar-workspace.ts'), 'utf8');
    expect(model).toContain('bookingOccupiesInventory');
    expect(model).toContain("=== 'authorized'");
    expect(page).toContain('upsertAvailability');
    expect(page).toContain('capacity: 0');
    expect(page).toContain('deleteAvailability');
    expect(page).toContain('openSupplierBooking');
    expect(page).toContain('isStay: true');
  });

  it('uses a non-layout toast for block feedback and a compact range toolbar', () => {
    const page = readFileSync(join(root, 'pages/supplier/SupplierStayCalendar.tsx'), 'utf8');
    expect(page).toContain('tv-stay-cal-toast');
    expect(page).toContain('tv-stay-cal-rangebar');
    expect(page).toContain('formatStayRangeLabel');
    expect(page).toContain('planStayRangeActions');
    expect(page).toContain('applyStayDateTap');
    expect(page).toContain('Block dates');
    expect(page).toContain('Clear selection');
    expect(page).not.toContain('Calendar updated');
    expect(page).toContain('showToast');
    expect(page).toContain('StayOpsSegmentedControl');
    expect(page).toContain('stay-ops-cal-chrome');
    expect(page).toContain('Calendar navigation');
    expect(page).toContain('stay-ops-week');
    expect(page).toContain('stay-ops-month');
    expect(page).toContain('stay-ops-agenda');
    expect(page).toContain('stayWeekSpanStyle');
  });

  it('rebuilds Month selection with continuous range and drag support', () => {
    const page = readFileSync(join(root, 'pages/supplier/SupplierStayCalendar.tsx'), 'utf8');
    expect(page).toContain('onCommitRange');
    expect(page).toContain('stayDateRangeFromDrag');
    expect(page).toContain('is-in-range');
    expect(page).toContain('data-stay-night');
    expect(page).toContain('stay-ops-month__guest');
    expect(page).not.toMatch(/tv-cal-day__meta">\{stayCalendarNightKindLabel\(kind\)\}/);
  });
});

