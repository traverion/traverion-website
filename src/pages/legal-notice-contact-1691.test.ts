import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1691: Legal notice contact offers in-app Contact support', () => {
  it('links /contact beside mailto', () => {
    const src = readFileSync(resolve(__dirname, 'LegalNotice.tsx'), 'utf8');
    expect(src).toContain('Phase 1691');
    expect(src).toContain('Contact support');
    expect(src).toContain("go('contact')");
  });
});
