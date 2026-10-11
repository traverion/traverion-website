import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { partnerPageFrameClass } from './supplierUi';

describe('partner layout system', () => {
  it('exposes distinct page frame modes for home, ops, and default', () => {
    expect(partnerPageFrameClass('default')).toContain('partner-page-frame');
    expect(partnerPageFrameClass('home')).toContain('partner-page-frame--home');
    expect(partnerPageFrameClass('ops')).toContain('partner-page-frame--ops');
  });

  it('defines shared gutter and hero tokens in partner shell CSS', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('--partner-gutter-x');
    expect(css).toContain('--partner-hero-mb');
    expect(css).toContain('.partner-page-frame');
    expect(css).toContain('.partner-stack');
  });

  it('defines typography, section, empty, and danger-button foundation tokens', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('--partner-title-size');
    expect(css).toContain('.partner-page-title');
    expect(css).toContain('.partner-section-title');
    expect(css).toContain('.partner-section');
    expect(css).toContain('.partner-empty');
    expect(css).toContain('.partner-btn-danger');
    expect(css).toContain('--partner-icon');
  });

  it('exports SupplierSection for consistent page architecture', async () => {
    const mod = await import('./supplierUi');
    expect(typeof mod.SupplierSection).toBe('function');
  });
});
