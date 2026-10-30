import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Consumer footer & page shell polish', () => {
  it('LegalPageShell supports wider layouts and sticky TOC', () => {
    const src = readFileSync(resolve(__dirname, 'LegalPageShell.tsx'), 'utf8');
    expect(src).toContain("layout?: ConsumerPageLayout");
    expect(src).toContain('max-w-[1200px]');
    expect(src).toContain('max-w-[1040px]');
    expect(src).toContain('max-w-[48rem]');
    expect(src).toContain('IntersectionObserver');
    expect(src).not.toContain('font-display');
  });

  it('footer keeps Support, Company, and Work with us destinations', () => {
    const src = readFileSync(resolve(__dirname, 'Footer.tsx'), 'utf8');
    expect(src).toContain("nav('contact')");
    expect(src).toContain("nav('packages')");
    expect(src).toContain("nav('stays')");
    expect(src).not.toContain("nav('cart')");
    expect(src).toContain("nav('bookings')");
    expect(src).toContain("nav('wishlist')");
    expect(src).toContain('Become an affiliate');
    expect(src).toContain('Become a content creator');
    expect(src).toContain('Become a supplier');
  });

  it('cookies page does not invent fake preference toggles', () => {
    const src = readFileSync(resolve(__dirname, '../pages/Cookies.tsx'), 'utf8');
    expect(src).toContain('does not yet ship an in-app cookie preference center');
    expect(src).not.toContain('type="checkbox"');
    expect(src).toContain('Always on');
  });
});
