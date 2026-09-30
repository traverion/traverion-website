import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1816: auth form panel coherence', () => {
  it('defines tv-auth-panel', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).toContain('Phase 1816');
    expect(css).toContain('.tv-auth-panel');
  });

  it('traveler and partner auth shells share the panel', () => {
    const traveler = readFileSync(resolve(__dirname, '../pages/AuthPage.tsx'), 'utf8');
    const partner = readFileSync(
      resolve(__dirname, 'supplier/PartnerAuthPage.tsx'),
      'utf8'
    );
    expect(traveler).toContain('tv-auth-panel');
    expect(partner).toContain('tv-auth-panel');
    expect(partner).toContain('Partner account');
    expect(partner).not.toContain('rounded-lg border border-black/[0.06] bg-paper px-3.5');
  });
});
