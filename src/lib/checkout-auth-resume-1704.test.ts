import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1704: checkout auth resume waits for session', () => {
  it('StayDetails gates on userRef and hydrates session before resume', () => {
    const src = readFileSync(resolve(__dirname, '../pages/StayDetails.tsx'), 'utf8');
    expect(src).toContain('Phase 1704');
    expect(src).toContain('!userRef.current');
    expect(src).toContain('await supabase.auth.getSession()');
    expect(src).toContain('userRef.current = sessionData.session.user');
    expect(src).toContain('void startStayCheckout()');
    // Must not wipe session mid-resume with per-render sync from stale React user.
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
    const src = readFileSync(resolve(__dirname, '../components/AuthModal.tsx'), 'utf8');
    expect(src).toContain('Phase 1704');
    expect(src).toContain('await supabase.auth.getSession()');
    expect(src).toContain('triggerAuthSuccess()');
  });
});
