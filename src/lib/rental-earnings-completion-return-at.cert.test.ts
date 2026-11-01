import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const mig = readFileSync(
  resolve(root, 'supabase/migrations/296_rental_earnings_completion_return_at.sql'),
  'utf8'
);

describe('Mission 06.3: rental earnings completion at returnAt', () => {
  it('branches rentals on booking_is_rental and uses returnAt', () => {
    expect(mig).toContain('booking_is_rental(p_booking)');
    expect(mig).toContain("purchase_snapshot->>'returnAt'");
    expect(mig).toContain('exact return instant');
  });

  it('preserves stay check-out and tour duration clocks', () => {
    expect(mig).toContain('booking_is_stay_night(p_booking)');
    expect(mig).toContain("purchase_snapshot->>'checkOutTime'");
    expect(mig).toContain('booking_official_start_at');
    expect(mig).toContain('booking_tour_duration_hours');
    expect(mig).toContain('pending verification until duration is known');
  });

  it('backfills only rental earning rows without inserting duplicates or changing amounts', () => {
    expect(mig).toContain("inventoryFamily', '') = 'rental'");
    expect(mig).toContain("e.status in ('pending', 'eligible')");
    expect(mig).toContain('amount_minor > 0');
    expect(mig).not.toContain('insert into public.supplier_earning_items');
    expect(mig).not.toMatch(/update\s+public\.supplier_earning_items[\s\S]*amount_minor\s*=/i);
    expect(mig).toContain('refresh_supplier_earning_eligibility');
  });
});
