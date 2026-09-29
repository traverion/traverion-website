import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1708: wishlist auth resume after Save/heart', () => {
  it('useTravelerWishlist hydrates session before toggle after auth', () => {
    const src = readFileSync(resolve(__dirname, '../hooks/useTravelerWishlist.ts'), 'utf8');
    expect(src).toContain('Phase 1708');
    expect(src).toContain('await supabase.auth.getSession()');
    expect(src).toContain('userRef.current = sessionData.session.user');
    expect(src).not.toMatch(/const userRef = useRef\(user\);\s*userRef\.current = user;/);
    expect(src).toMatch(/useEffect\(\(\) => \{\s*userRef\.current = user;\s*\}, \[user\]\)/);
  });

  it('TourDetails and StayDetails wishlist resume mirror checkout session hydrate', () => {
    const tour = readFileSync(resolve(__dirname, '../pages/TourDetails.tsx'), 'utf8');
    const stay = readFileSync(resolve(__dirname, '../pages/StayDetails.tsx'), 'utf8');
    expect(tour).toContain('Phase 1708');
    expect(stay).toContain('Phase 1708');
    for (const src of [tour, stay]) {
      expect(src).toContain('await supabase.auth.getSession()');
      expect(src).toMatch(/handleToggleWishlist[\s\S]*!userRef\.current/);
      expect(src).not.toMatch(/requestAuth\(\{\s*onSuccess:\s*\(\)\s*=>\s*void run\(\)/);
    }
  });
});
