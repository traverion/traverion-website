import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1732: review write after force-unpublish', () => {
  it('migration defines traveler_may_write_review SECURITY DEFINER', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../supabase/migrations/212_traveler_may_write_review_unpublished.sql'),
      'utf8'
    );
    expect(sql).toContain('Phase 1732');
    expect(sql).toContain('traveler_may_write_review');
    expect(sql).toContain('security definer');
    expect(sql).toContain('booking_experience_started_for_review');
    expect(sql).toContain('Users can insert own review');
    expect(sql).toContain('Users can update own review');
    expect(sql).not.toMatch(
      /with check \(\s*auth\.uid\(\) = reviews\.user_id[\s\S]*join public\.listings l on l\.id = b\.listing_id/
    );
  });
});
