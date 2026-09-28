import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('admin_force_unpublish upcoming stay checkout (Phase 1566)', () => {
  const mig = readFileSync(
    join(here, '../../supabase/migrations/207_admin_force_unpublish_upcoming_stay_checkout.sql'),
    'utf8'
  );

  it('counts stay upcoming via stay_booking_check_out not raw coalesce check_out', () => {
    expect(mig).toContain('Phase 1566');
    expect(mig).toMatch(
      /booking_is_stay_night\(b\)\s+then\s+public\.stay_booking_check_out\(b\)/
    );
    expect(mig).not.toMatch(
      /and coalesce\(b\.check_out, b\.booking_date\) >= \(timezone\('utc', now\(\)\)\)::date;/
    );
  });
});
