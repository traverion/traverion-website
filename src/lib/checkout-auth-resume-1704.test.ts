import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1704: checkout auth resume waits for session', () => {
  it('StayBookingConfirm gates on userRef and hydrates session before startPayment', () => {
    // Checkout resume moved off StayDetails into StayBookingConfirm; keep the
    // same Phase 1704 contract: getSession before re-entering payment.
    const src = readFileSync(resolve(__dirname, '../pages/StayBookingConfirm.tsx'), 'utf8');
    expect(src).toContain('Phase 1704');
    expect(src).toContain('!userRef.current');
    expect(src).toContain('await supabase.auth.getSession()');
    expect(src).toContain('userRef.current = sessionData.session.user');
    expect(src).toContain('void startPayment()');
    expect(src).not.toMatch(/const userRef = useRef\(user\);\s*userRef\.current = user;/);
    expect(src).toMatch(/useEffect\(\(\) => \{\s*userRef\.current = user;\s*\}, \[user\]\)/);
  });

  it('StayDetails wishlist/auth resume still hydrates session via userRef (Phase 1708)', () => {
    const src = readFileSync(resolve(__dirname, '../pages/StayDetails.tsx'), 'utf8');
    expect(src).toContain('Phase 1704');
    expect(src).toContain('!userRef.current');
    expect(src).toContain('await supabase.auth.getSession()');
    expect(src).toContain('userRef.current = sessionData.session.user');
    expect(src).not.toMatch(/const userRef = useRef\(user\);\s*userRef\.current = user;/);
    expect(src).toMatch(/useEffect\(\(\) => \{\s*userRef\.current = user;\s*\}, \[user\]\)/);
  });

  it('BookingPage resumes confirm after getSession hydrates userRef', () => {
    const src = readFileSync(resolve(__dirname, '../pages/BookingPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1704');
    expect(src).toContain('await supabase.auth.getSession()');
    expect(src).toContain('void handleConfirmBooking()');
    expect(src).not.toMatch(/const userRef = useRef\(user\);\s*userRef\.current = user;/);
    expect(src).toMatch(/useEffect\(\(\) => \{\s*userRef\.current = user;\s*\}, \[user\]\)/);
  });

  it('AuthModal awaits getSession before triggerAuthSuccess', () => {
    const form = readFileSync(resolve(__dirname, '../components/auth/TravelerAuthForm.tsx'), 'utf8');
    const modal = readFileSync(resolve(__dirname, '../components/AuthModal.tsx'), 'utf8');
    expect(form).toContain('Phase 1704');
    expect(form).toContain('await supabase.auth.getSession()');
    expect(modal).toContain('triggerAuthSuccess()');
  });

  it('Phase 1852: TourDetails does not clear tour on auth (preserves checkout step)', () => {
    const src = readFileSync(resolve(__dirname, '../pages/TourDetails.tsx'), 'utf8');
    expect(src).toContain('Phase 1852: blank tour only when the listing id changes');
    expect(src).toContain('setLocationSearch(window.location.search)');
    const authLoad = src.slice(src.indexOf('}, [tourId, user?.id]'));
    expect(src).toMatch(
      /useEffect\(\(\) => \{\s*setTourLoadError\(null\);\s*setTour\(null\);\s*setReviewOnlyAccess\(false\);\s*\}, \[tourId\]\)/
    );
    void authLoad;
  });
});
