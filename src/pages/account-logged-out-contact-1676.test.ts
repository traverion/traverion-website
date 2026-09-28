import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1676: Logged-out Account offers Contact support', () => {
  it('includes Contact support beside browse exits', () => {
    const src = readFileSync(resolve(__dirname, 'AccountPage.tsx'), 'utf8');
    expect(src).toContain('Phase 1676');
    const signedOut = src.slice(src.indexOf('Log in to manage trips'), src.indexOf('const badge'));
    expect(signedOut).toContain('Contact support');
    expect(signedOut).toContain("onNavigate('contact')");
  });
});
