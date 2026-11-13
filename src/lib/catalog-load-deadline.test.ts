import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SUPABASE_FETCH_TIMEOUT_MS } from './supabase';

describe('catalog request deadline', () => {
  it('aborts a stalled Supabase fetch before the skeleton looks permanent', () => {
    expect(SUPABASE_FETCH_TIMEOUT_MS).toBeGreaterThan(0);
    expect(SUPABASE_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(12_000);
  });

  it('settles the public catalog hook on that same deadline', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../hooks/usePublishedSupplierListings.ts'),
      'utf8'
    );
    expect(src).toMatch(/SUPABASE_FETCH_TIMEOUT_MS/);
    expect(src).toMatch(/setError\(USER_ERROR\.tours\)/);
  });

  it('paints a confirmed session before the partner-profile lookup', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../contexts/AuthContext.tsx'),
      'utf8'
    );
    expect(src).toMatch(
      /if \(canPaint\) \{\s*setUser\(next\);\s*setLoading\(false\);\s*\}\s*await applySessionUser\(next\);/
    );
    expect(src).toMatch(/partnerGateInflight/);
  });
});
