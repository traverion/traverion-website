import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1624: About Travelers card My bookings link', () => {
  it('links My bookings to bookings', () => {
    const src = readFileSync(resolve(__dirname, 'About.tsx'), 'utf8');
    expect(src).toContain('Phase 1624');
    expect(src).toContain('My bookings');
    expect(src).toContain("onNavigate('bookings')");
    expect(src).toContain('href="/bookings"');
  });
});
