import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1690: Terms contact offers in-app Contact support', () => {
  it('links /contact beside mailto in contact section', () => {
    const src = readFileSync(resolve(__dirname, 'Terms.tsx'), 'utf8');
    expect(src).toContain('Phase 1690');
    expect(src).toContain('Contact support');
  });
});
