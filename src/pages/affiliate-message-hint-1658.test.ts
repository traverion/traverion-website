import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Affiliate application form', () => {
  it('collects audience and promotion details with structured submission', () => {
    const src = readFileSync(resolve(__dirname, 'AffiliatePage.tsx'), 'utf8');
    expect(src).toContain('aff-audience');
    expect(src).toContain('aff-promote');
    expect(src).toContain('inquiry_type: \'affiliate\'');
    expect(src).toContain('structured_data');
    expect(src).toContain('submitContactInquiry');
  });
});
