import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1809: supplier home operational hierarchy', () => {
  it('uses compact sans metric hierarchy and unified boxed schedule chrome', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierDashboard.tsx'), 'utf8');
    expect(src).toContain('partner-home__greeting');
    expect(src).toContain('partner-home__metric-value');
    expect(src).toContain('partner-home-section');
    expect(src).toContain('Business metrics');
    expect(src).toContain('Upcoming schedule');
    expect(src).toContain('partner-home__ops-pill');
    expect(src).not.toContain('Business performance');
    expect(src).not.toContain('New listing');
    expect(src).not.toContain('font-display text-[1.125rem]');
    expect(src).not.toContain('Today at a glance');
  });
});
