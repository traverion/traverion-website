import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1826: Account hub tile polish', () => {
  it('defines tv-account-tile', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).toContain('Phase 1826');
    expect(css).toContain('.tv-account-tile');
  });

  it('AccountPage uses display section head and account tiles', () => {
    const src = readFileSync(resolve(__dirname, '../pages/AccountPage.tsx'), 'utf8');
    expect(src).toContain('tv-account-tile');
    expect(src).toContain('font-display text-[1.125rem]');
    expect(src).toContain('tv-skeleton');
    expect(src).not.toContain('animate-pulse rounded bg-black/[0.06]');
  });
});
