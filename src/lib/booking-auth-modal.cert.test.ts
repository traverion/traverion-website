import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

describe('Unified booking AuthModal (Tour / Stay / Rental)', () => {
  it('Stay Reserve gates through shared requestAuth then resumes review', () => {
    const stay = read('src/pages/StayDetails.tsx');
    expect(stay).toContain("intent: 'checkout'");
    expect(stay).toContain('pushStayBookingConfirm');
    expect(stay).toContain('requestAuth({');
    expect(stay).toMatch(/if \(isSupabaseConfigured\(\) && !userRef\.current\)/);
  });

  it('Rental Continue gates through shared requestAuth then resumes review', () => {
    const rental = read('src/pages/RentalDetails.tsx');
    expect(rental).toContain("intent: 'checkout'");
    expect(rental).toContain('pushRentalBookingConfirm');
    expect(rental).toContain('requestAuth({');
    expect(rental).toMatch(/if \(isSupabaseConfigured\(\) && !userRef\.current\)/);
  });

  it('Tour Continue already uses the shared AuthModal checkout intent', () => {
    const tour = read('src/pages/TourDetails.tsx');
    expect(tour).toContain("intent: 'checkout'");
    expect(tour).toContain('requestAuth({');
  });

  it('AuthModal uses enter/exit phases without tv-pop bounce', () => {
    const modal = read('src/components/AuthModal.tsx');
    expect(modal).toContain('tv-auth-overlay--open');
    expect(modal).toContain('tv-auth-dialog--exit');
    expect(modal).not.toContain('tv-pop');
    expect(modal).toContain('prefersReducedMotion');
  });

  it('hides nonfunctional Google auth until enabled', () => {
    const form = read('src/components/auth/TravelerAuthForm.tsx');
    expect(form).toContain('GOOGLE_AUTH_ENABLED');
    expect(form).not.toContain('Coming soon. Google sign-in is not enabled yet.');
    expect(read('src/lib/googleAuth.ts')).toContain('GOOGLE_AUTH_ENABLED = false');
  });
});
