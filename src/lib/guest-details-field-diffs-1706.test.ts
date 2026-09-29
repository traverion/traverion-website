import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { guestMayInvokeCustomerEmailKind } from './notify-customer-booking-auth';

/** Phase 1706 mirror of edge allowCallerFieldDiffs for guest-originated kinds. */
function guestMaySupplyCustomerFieldDiffs(params: {
  callerIsGuest: boolean;
  callerIsSupplierSide: boolean;
  emailKind: string;
}): boolean {
  if (params.callerIsSupplierSide) return true;
  return (
    params.callerIsGuest &&
    !params.callerIsSupplierSide &&
    guestMayInvokeCustomerEmailKind(params.emailKind)
  );
}

describe('Phase 1706: guest your_details_updated keeps fieldDiffs', () => {
  it('guest JWT may supply diffs for your_details_updated and booking_cancelled', () => {
    expect(
      guestMaySupplyCustomerFieldDiffs({
        callerIsGuest: true,
        callerIsSupplierSide: false,
        emailKind: 'your_details_updated',
      })
    ).toBe(true);
    expect(
      guestMaySupplyCustomerFieldDiffs({
        callerIsGuest: true,
        callerIsSupplierSide: false,
        emailKind: 'booking_cancelled',
      })
    ).toBe(true);
    expect(
      guestMaySupplyCustomerFieldDiffs({
        callerIsGuest: true,
        callerIsSupplierSide: false,
        emailKind: 'host_updated_schedule',
      })
    ).toBe(false);
  });

  it('edge notify-customer-booking wires Phase 1706 allowCallerFieldDiffs', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/notify-customer-booking/index.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1706');
    expect(src).toContain('guestMayInvokeCustomerEmailKind(kind)');
    expect(src).toMatch(
      /allowCallerFieldDiffs\s*=\s*callerIsSupplierSide\s*\|\|\s*\(callerIsGuest && !callerIsSupplierSide && guestMayInvokeCustomerEmailKind\(kind\)\)/
    );
  });

  it('Trips note update still sends your_details_updated with fieldDiffs', () => {
    const src = readFileSync(resolve(__dirname, '../data/supabase-bookings.ts'), 'utf8');
    expect(src).toContain("emailKind: 'your_details_updated'");
    expect(src).toContain('fieldDiffs');
  });
});
