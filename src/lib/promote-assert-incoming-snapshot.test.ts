import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('promote_paid merges incoming snapshot before assert (Phase 1568)', () => {
  const mig = readFileSync(
    join(here, '../../supabase/migrations/208_promote_assert_incoming_purchase_snapshot.sql'),
    'utf8'
  );

  it('folds p_purchase_snapshot onto v_row before stay_booking_check_out', () => {
    expect(mig).toContain('Phase 1568');
    expect(mig).toMatch(
      /IF p_purchase_snapshot IS NOT NULL THEN[\s\S]*v_row\.purchase_snapshot := p_purchase_snapshot;[\s\S]*booking_is_stay_night\(v_row\)/
    );
    expect(mig).toMatch(
      /v_row\.purchase_snapshot := p_purchase_snapshot;[\s\S]*stay_booking_check_out\(v_row\)/
    );
  });
});
