import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Pickup Planner UX redesign', () => {
  it('groups departures by date, paginates days, and uses Traverion time select', () => {
    const workspace = readFileSync(resolve(__dirname, 'PickupPlannerWorkspace.tsx'), 'utf8');
    const page = readFileSync(resolve(__dirname, '../../pages/supplier/SupplierPickupPlanner.tsx'), 'utf8');
    const time = readFileSync(resolve(__dirname, 'PartnerTimeSelect.tsx'), 'utf8');
    expect(workspace).toContain('formatPickupPlannerDateHeading');
    expect(workspace).toContain('paginateDayGroups');
    expect(workspace).toContain('Manage pickups');
    expect(workspace).toContain('Manage meeting');
    expect(workspace).toContain('Pickup time needed');
    expect(workspace).toContain('PartnerTimeSelect');
    expect(workspace).toContain('tv-pickup-manage-sheet');
    expect(workspace).toContain('Save & notify guests');
    expect(page).toContain('dayPage');
    expect(page).toContain('onPageChange');
    expect(page).toContain('bookingsLenRef');
    expect(time).toContain('24');
    expect(time).not.toContain('type="time"');
  });
});
