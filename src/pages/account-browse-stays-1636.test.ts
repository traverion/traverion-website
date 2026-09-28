import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1636: Account Browse stays CTAs', () => {
  it('offers Browse stays on unconfigured and signed-in hubs', () => {
    const src = readFileSync(resolve(__dirname, 'AccountPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1636');
    expect((src.match(/Browse stays/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/onNavigate\('stays'\)/);
  });
});
