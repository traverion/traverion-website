import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1786: reminder/review auth email fallback', () => {
  it('resolves guest email via auth when guest_email is empty', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/send-booking-reminders/index.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1786');
    expect(src).toContain('resolveGuestEmail');
    expect(src).toContain('guest_user_id');
    expect(src).toContain('auth.admin.getUserById');
    expect(src).toMatch(/const email = await resolveGuestEmail\(admin,\s*row\)/);
    expect(src).toMatch(
      /reviewCandidates \+= 1;\s*const email = await resolveGuestEmail\(admin/
    );
  });
});
