import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1635: Account stats error title', () => {
  it('says account summary instead of only trips', () => {
    const src = readFileSync(resolve(__dirname, 'AccountPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1635');
    expect(src).toContain('Could not load your account summary');
    expect(src).not.toContain('Could not load your trips');
  });
});
