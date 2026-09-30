import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1780: consumer profile fetch errors do not wipe travelers', () => {
  it('fetchConsumerProfile throws on error', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-consumer-profile.ts'), 'utf8');
    expect(src).toContain('Phase 1780');
    const fn = src.slice(
      src.indexOf('export async function fetchConsumerProfile'),
      src.indexOf('export async function fetchConsumerProfileRow')
    );
    expect(fn).toContain('throw new Error(error.message)');
  });

  it('AuthContext keeps session when consumer lookup throws', () => {
    const src = readFileSync(resolve(__dirname, '../contexts/AuthContext.tsx'), 'utf8');
    expect(src).toContain('Phase 1780');
    expect(src).toMatch(/catch \{\s*\/\/ Phase 1780:[\s\S]*?return true;/);
  });
});
