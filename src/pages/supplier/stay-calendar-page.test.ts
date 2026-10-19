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
});
