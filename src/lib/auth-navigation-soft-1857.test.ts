import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1857: soft partner post-login navigation', () => {
  it('exports softReplacePathIfChanged and SupplierLayout uses it after auth', () => {
    const nav = readFileSync(resolve(__dirname, './authNavigation.ts'), 'utf8');
    expect(nav).toContain('export function softReplacePathIfChanged');
    const layout = readFileSync(
      resolve(__dirname, '../components/supplier/SupplierLayout.tsx'),
      'utf8'
    );
    expect(layout).toContain('softReplacePathIfChanged');
    expect(layout).toMatch(/handleAuthenticated[\s\S]*softReplacePathIfChanged/);
  });
});
