import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('listing booking contact save resilience', () => {
  it('treats missing listing_booking_contact schema as non-blocking for listing saves', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-listings.ts'), 'utf8');
    expect(src).toContain('isMissingRelationError');
    expect(src).toContain('PGRST205');
    expect(src).toContain('skip phone save until migration 242');
    expect(src).toContain('skip clear until migration 242');
  });
});
