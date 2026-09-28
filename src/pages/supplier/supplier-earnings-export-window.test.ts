import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('SupplierEarnings Money export window (Phase 1574)', () => {
  const src = readFileSync(join(here, 'SupplierEarnings.tsx'), 'utf8');

  it('export and canExport use windowed Refund due, not all-time', () => {
    expect(src).toContain('Phase 1574');
    expect(src).toMatch(/refundDueBookingsInWindow/);
    expect(src).toMatch(
      /buildPartnerMoneyCsvRows\(\{[\s\S]*refundDue:\s*refundDueBookingsInWindow/
    );
    expect(src).toMatch(
      /partnerMoneyCsvHasExportableRows\(\{[\s\S]*refundDue:\s*refundDueBookingsInWindow/
    );
    // Hero balances must still use all-time refundDueBookings.
    expect(src).toMatch(/moneyByCurrency[\s\S]*refundDueBookings/);
  });
});
