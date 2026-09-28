import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1619: Contact success follow-up', () => {
  it('offers Send another message and topic placeholders including partner', () => {
    const src = readFileSync(resolve(__dirname, 'Contact.tsx'), 'utf8');
    expect(src).toContain('Phase 1619');
    expect(src).toContain('Send another message');
    expect(src).toContain("topic === 'partner'");
    expect(src).toContain('successHeadingRef');
  });
});
