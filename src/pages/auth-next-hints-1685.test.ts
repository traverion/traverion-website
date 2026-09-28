import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1685: Auth next= hints cover packages/stays/contact', () => {
  it('explains return destinations beyond wishlist/trips/account', () => {
    const src = readFileSync(resolve(__dirname, 'AuthPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1685');
    expect(src).toContain("nextPage === 'packages'");
    expect(src).toContain("nextPage === 'stays'");
    expect(src).toContain("nextPage === 'contact'");
    expect(src).toContain('safe-area-inset-top');
  });
});
