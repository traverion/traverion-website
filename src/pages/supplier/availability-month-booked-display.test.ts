import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Month view Booked / Capacity display', () => {
  it('renders booked/capacity in month cells, never unlabeled remaining/capacity', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierAvailability.tsx'), 'utf8');
    expect(src).toContain('line.booked}/${line.capacity}');
    expect(src).toContain('monthCapacityLabel.booked}/${monthCapacityLabel.capacity}');
    expect(src).toContain('tourCapacity - remaining');
    expect(src).not.toContain('${line.remaining}/${line.capacity}');
    expect(src).not.toContain('{monthCapacityLabel.remaining} / {monthCapacityLabel.capacity}');
    expect(src).not.toContain('{remaining} / {tourCapacity}');
  });

  it('keeps Limited for scarce seats only in workspace status classification', () => {
    const src = readFileSync(resolve(__dirname, 'availabilityWorkspaceModel.ts'), 'utf8');
    expect(src).toContain('Light occupancy must stay Available');
    expect(src).not.toMatch(/if \(params\.remaining < params\.capacity\) return 'limited';/);
  });
});
