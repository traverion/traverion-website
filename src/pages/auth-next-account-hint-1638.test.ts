import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1638: Auth next=account destination hint', () => {
  it('explains return to Account when next is account', () => {
    const src = readFileSync(resolve(__dirname, 'AuthPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1638');
    expect(src).toContain('After you log in, we will take you to Account.');
    expect(src).toMatch(/nextPage === 'account'/);
  });
});
