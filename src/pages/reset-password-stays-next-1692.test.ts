import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1692: Reset password allows next=stays', () => {
  it('includes stays in the allowed next set', () => {
    const src = readFileSync(resolve(__dirname, 'ResetPasswordPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1692');
    expect(src).toContain("'stays'");
  });
});
