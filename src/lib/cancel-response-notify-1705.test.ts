import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  guestMayInvokeCustomerEmailKind,
} from './notify-customer-booking-auth';
import { guestMayInvokeSupplierEvent } from './notify-supplier-event-auth';

describe('Phase 1705: cancel Accept/Decline notify allowlists', () => {
  it('guest JWT may invoke cancellation_accepted and cancellation_declined on both paths', () => {
    expect(guestMayInvokeSupplierEvent('cancellation_accepted')).toBe(true);
    expect(guestMayInvokeSupplierEvent('cancellation_declined')).toBe(true);
    expect(guestMayInvokeCustomerEmailKind('cancellation_accepted')).toBe(true);
    expect(guestMayInvokeCustomerEmailKind('cancellation_declined')).toBe(true);
  });

  it('MyBookings still routes Accept/Decline through notifyCancellationResolved', () => {
    const src = readFileSync(resolve(__dirname, '../pages/MyBookings.tsx'), 'utf8');
    expect(src).toContain('notifyCancellationResolved');
    expect(src).toContain('respondToCancellationRequest');
  });

  it('Deno shared mirrors match Phase 1705 allowlists', () => {
    const supplier = readFileSync(
      resolve(__dirname, '../../supabase/functions/_shared/notify-supplier-event-auth.ts'),
      'utf8'
    );
    const customer = readFileSync(
      resolve(__dirname, '../../supabase/functions/_shared/notify-customer-booking-auth.ts'),
      'utf8'
    );
    expect(supplier).toContain('Phase 1705');
    expect(supplier).toContain("kind === 'cancellation_accepted'");
    expect(supplier).toContain("kind === 'cancellation_declined'");
    expect(customer).toContain('Phase 1705');
    expect(customer).toContain("kind === 'cancellation_accepted'");
    expect(customer).toContain("kind === 'cancellation_declined'");
  });
});
