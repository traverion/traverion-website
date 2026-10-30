import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1623: Footer Company My bookings link', () => {
  it('links My bookings under Company', () => {
    const src = readFileSync(resolve(__dirname, 'Footer.tsx'), 'utf8');
    expect(src).toContain('Phase 1623');
    expect(src).toMatch(/nav\('bookings'\)[\s\S]{0,80}My bookings/);
    expect(src).not.toContain("nav('cart')");
  });
});
