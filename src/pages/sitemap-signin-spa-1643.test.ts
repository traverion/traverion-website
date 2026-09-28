import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1643: Sitemap Sign in uses SPA auth navigation', () => {
  it('uses travelerLoginHref and onNavigate auth for log-in links', () => {
    const src = readFileSync(resolve(__dirname, 'Sitemap.tsx'), 'utf8');
    expect(src).toContain('Phase 1643');
    expect(src).toContain('travelerLoginHref');
    expect(src).toContain("onNavigate('auth')");
    expect(src).not.toContain("href: '/log-in?next=account'");
  });
});
