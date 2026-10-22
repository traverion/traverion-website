/**
 * Sprint 02 — prevent reintroduction of hardcoded Supabase JWTs in tracked scripts.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');

function walkTrackedScripts(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTrackedScripts(p, out);
    else if (/\.(cjs|js|mjs|mts|ts)$/.test(name) && !name.includes('.test.')) out.push(p);
  }
  return out;
}

describe('Launch Certification Sprint 02 — no hardcoded service-role JWTs in tracked scripts', () => {
  it('scripts/*.cjs do not embed service_role JWT payloads', () => {
    const files = walkTrackedScripts(resolve(root, 'scripts')).filter((p) => !p.endsWith('cert-transactional-emails.cjs'));
    // gitignored private harness may still exist locally; only assert tracked example + partner-demo helpers
    const tracked = files.filter((p) => !p.includes('cert-transactional-emails.cjs'));
    for (const file of tracked) {
      const src = readFileSync(file, 'utf8');
      expect(src.includes('"role":"service_role"') || src.includes('role":"service_role')).toBe(false);
      // Compact JWT with service_role claim in payload (base64) often contains this substring when decoded;
      // guard the common hardcode pattern of a full eyJ… assignment longer than a placeholder.
      const hardcoded = src.match(/serviceKey\s*=\s*\n?\s*'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'/);
      expect(hardcoded).toBeNull();
    }
    const example = readFileSync(resolve(root, 'scripts/cert-transactional-emails.example.cjs'), 'utf8');
    expect(example).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(example).not.toMatch(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  });
});
