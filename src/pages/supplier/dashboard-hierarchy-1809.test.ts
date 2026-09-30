import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1809: supplier home operational hierarchy', () => {
  it('uses display type for section heads and metric values', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierDashboard.tsx'), 'utf8');
    expect(src).toContain('font-display text-[1.125rem]');
    expect(src).toContain('font-display text-[1.5rem]');
    expect(src).toContain('Today at a glance');
    expect(src).toContain('min-h-11');
    expect(src).not.toContain('text-[16px] font-semibold tracking-tight text-slate-900');
  });
});
