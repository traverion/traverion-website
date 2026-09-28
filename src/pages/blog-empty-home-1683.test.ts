import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1683: Blog empty offers Back to home', () => {
  it('includes Back to home beside browse/contact exits', () => {
    const src = readFileSync(resolve(__dirname, 'Blog.tsx'), 'utf8');
    expect(src).toContain('Phase 1683');
    expect(src).toContain('Back to home');
    expect(src).toContain("onNavigate('home')");
  });
});
