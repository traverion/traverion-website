import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('promote snapshot max checkOut merge (Phase 1569)', () => {
  const mig = readFileSync(
    join(here, '../../supabase/migrations/209_promote_snapshot_max_checkout_merge.sql'),
    'utf8'
  );

  it('merges existing||incoming with greatest checkOut before assert', () => {
    expect(mig).toContain('Phase 1569');
    expect(mig).toMatch(/v_row\.purchase_snapshot := v_row\.purchase_snapshot \|\| p_purchase_snapshot/);
    expect(mig).toMatch(/greatest\(v_existing_out, v_incoming_out\)/);
    expect(mig).toMatch(
      /purchase_snapshot = coalesce\(v_row\.purchase_snapshot, purchase_snapshot\)/
    );
    expect(mig).not.toMatch(
      /v_row\.purchase_snapshot := p_purchase_snapshot;\s*\n\s*END IF;\s*\n\s*IF public\.booking_is_stay_night/
    );
  });
});
