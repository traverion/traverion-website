import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1640: Cookies TOC labels match headings', () => {
  it('uses the same wording as h2 titles in the TOC', () => {
    const src = readFileSync(resolve(__dirname, 'Cookies.tsx'), 'utf8');
    expect(src).toContain('Phase 1640');
    expect(src).toContain("label: 'How we use cookies'");
    expect(src).toContain("label: 'Third-party tools & retention'");
    expect(src).toContain("label: 'Contact us'");
    expect(src).not.toContain("label: 'How we use them'");
    expect(src).not.toContain("label: 'Third parties'");
  });
});
