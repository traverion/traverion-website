import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Rental Instant Book no pre-payment inventory hold', () => {
  const mig = readFileSync(
    resolve(__dirname, '../../supabase/migrations/294_rental_instant_book_no_hold.sql'),
    'utf8'
  );
  const edge = readFileSync(
    resolve(__dirname, '../../supabase/functions/create-booking-checkout-session/index.ts'),
    'utf8'
  );
  const promote = readFileSync(
    resolve(__dirname, '../../supabase/functions/_shared/promote-paid-from-checkout.ts'),
    'utf8'
  );
  const confirmPage = readFileSync(resolve(__dirname, '../pages/RentalBookingConfirm.tsx'), 'utf8');
  const bookingPage = readFileSync(resolve(__dirname, '../pages/BookingPage.tsx'), 'utf8');
  const cartPage = readFileSync(resolve(__dirname, '../pages/CartPage.tsx'), 'utf8');
  const copy = readFileSync(resolve(__dirname, './booking-confirmation-copy.ts'), 'utf8');

  it('migration stops checkout from inserting held inventory and allocates on paid', () => {
    expect(mig).toMatch(/instant_book_no_hold/i);
    expect(mig).toContain('evaluate_rental_availability');
    expect(mig).not.toMatch(
      /claim_rental_checkout_booking[\s\S]*?v_hold := public\.claim_rental_inventory_hold/
    );
    expect(mig).toContain('claim_rental_inventory_hold');
    expect(mig).toMatch(/confirm_rental_checkout_paid[\s\S]*paid:/);
    expect(mig).toContain('inventory_reserved');
    // release must not write nonexistent bookings.updated_at
    const releaseFn = mig.slice(mig.indexOf('create or replace function public.release_rental_checkout_booking'));
    expect(releaseFn).toContain('cancellation_reason');
    expect(releaseFn).toContain("set_config('app.bypass_booking_cancellation_guard'");
    expect(releaseFn).not.toMatch(/update public\.bookings[\s\S]*updated_at\s*=\s*now\(\)/);
  });

  it('promote still refunds inventory conflicts after concurrent paid promote', () => {
    expect(promote).toContain("event_type: 'inventory_conflict_checkout_refund'");
    expect(promote).toContain('inventory-conflict-checkout-refund:${session.id}');
    expect(promote).toContain('needsIntervention: true');
  });

  it('consumer copy does not claim spots/nights/inventory are held during unpaid checkout', () => {
    expect(bookingPage).not.toContain('Spots are held for');
    expect(bookingPage).toContain('Spots stay available until payment succeeds');
    expect(cartPage).toContain('Checkout open · not reserved');
    expect(cartPage).not.toMatch(/Held for \$\{remaining\}/);
    expect(confirmPage).toContain('Inventory stays available until payment succeeds');
    expect(confirmPage).not.toContain('Inventory is held only after payment starts');
    expect(copy).toContain('Inventory is reserved only after payment succeeds');
    expect(copy).toContain('Spots were not reserved');
    expect(copy).toContain('Dates were not reserved');
    expect(copy).toContain('Inventory was not reserved');
  });

  it('edge rental path still soft-claims then Stripe then freeze-before-session', () => {
    expect(edge).toContain("admin.rpc('claim_rental_checkout_booking'");
    expect(edge).toContain("timing.mark('rentalFreezeMs')");
    expect(edge).toMatch(
      /timing\.mark\('rentalFreezeMs'\)[\s\S]*?timing\.mark\('stripeSessionMs'\)/
    );
  });
});
