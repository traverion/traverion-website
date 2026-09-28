import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1649: Blog empty Contact CTA', () => {
  it('offers Contact us beside browse tours and stays', () => {
    const src = readFileSync(resolve(__dirname, 'Blog.tsx'), 'utf8');
    expect(src).toContain('Phase 1649');
    expect(src).toContain('Contact us');
    expect(src).toContain("onNavigate?.('contact')");
  });
});
