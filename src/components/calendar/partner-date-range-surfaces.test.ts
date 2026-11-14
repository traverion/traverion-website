import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');

function src(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

describe('partner date ranges use the Traverion calendar', () => {
  it('keeps cancellation, bookings, analytics, income, and pickup off the browser date popup', () => {
    const files = [
      'src/components/supplier/SupplierCancellationWorkflow.tsx',
      'src/pages/supplier/SupplierBookings.tsx',
      'src/pages/supplier/SupplierPerformance.tsx',
      'src/pages/supplier/SupplierEarnings.tsx',
      'src/pages/supplier/SupplierPickupPlanner.tsx',
    ];
    for (const file of files) {
      const text = src(file);
      expect(text, file).toContain('TraverionDateRangeField');
      expect(text, file).not.toContain('type="date"');
    }
  });

  it('leaves the scheduling calendars on their own date controls', () => {
    expect(src('src/pages/supplier/SupplierUnifiedCalendar.tsx')).toContain('TraverionSingleDateField');
    expect(src('src/pages/supplier/SupplierStayCalendar.tsx')).not.toContain('TraverionDateRangeField');
  });

  it('does not change cancellation date comparisons', () => {
    const filters = src('src/lib/supplier-cancellation-workflow.ts');
    expect(filters).toContain('row.date < filters.dateFrom');
    expect(filters).toContain('row.date > filters.dateTo');
  });
});
