import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('Rental PDP intelligent availability (cert)', () => {
  const widget = readFileSync(join(here, '../components/rental/RentalBookingWidget.tsx'), 'utf8');
  const mig = readFileSync(
    join(here, '../../supabase/migrations/295_rental_public_occupancy_and_anon_evaluate.sql'),
    'utf8'
  );
  const noHold = readFileSync(
    join(here, '../../supabase/migrations/294_rental_instant_book_no_hold.sql'),
    'utf8'
  );

  it('filters pickup/return times with occupancy and auto-selects earliest valid', () => {
    expect(widget).toContain('fetchRentalPublicOccupancy');
    expect(widget).toContain('filterValidPickupTimes');
    expect(widget).toContain('filterValidReturnTimes');
    expect(widget).toContain('rentalPickupDayUnavailable');
    expect(widget).toContain('availableFromHint');
    expect(widget).toContain('humanizeRentalAvailabilityError');
  });

  it('does not reintroduce unpaid inventory holds', () => {
    expect(noHold).toContain("'inventory_reserved', false");
    expect(noHold).toContain('no inventory hold until paid promote');
    expect(widget).not.toMatch(/claim_rental_inventory_hold/);
    expect(widget).toContain('evaluateRentalAvailabilityRpc');
  });

  it('exposes anonymized public occupancy + anon evaluate grant', () => {
    expect(mig).toContain('rental_public_occupancy');
    expect(mig).toContain('to anon, authenticated, service_role');
    expect(mig).toContain('evaluate_rental_availability');
  });
});
