import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('web-vitals-lite', () => {
  it('is opt-in and avoids PII in logged fields', () => {
    const src = readFileSync(resolve(__dirname, 'web-vitals-lite.ts'), 'utf8');
    expect(src).toContain('isWebVitalsReportingEnabled');
    expect(src).toContain("get('perf') === '1'");
    expect(src).toContain('pathOnly');
    expect(src).not.toContain('user.id');
    expect(src).not.toContain('email');
  });

  it('is installed from main entry', () => {
    const main = readFileSync(resolve(__dirname, '../main.tsx'), 'utf8');
    expect(main).toContain('installWebVitalsLite');
  });
});
