import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression: overflow-x: hidden on the document/main scroll roots computes
 * overflow-y to auto (CSS overflow quirk). Wheel/trackpad over <main> then
 * hits a non-scrolling scrollport and the page only scrolls when the cursor
 * is over the fixed header. Prefer overflow-x: clip on those roots.
 */
describe('traveler document scroll roots', () => {
  it('uses overflow-x: clip on html/body base styles (not hidden)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const htmlBlock = css.match(/@layer base\s*\{[\s\S]*?\bhtml\s*\{([^}]*)\}/)?.[1] ?? '';
    const bodyBlock = css.match(/@layer base\s*\{[\s\S]*?\bbody\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(htmlBlock).toMatch(/overflow-x:\s*clip/);
    expect(bodyBlock).toMatch(/overflow-x:\s*clip/);
    expect(htmlBlock).not.toMatch(/overflow-x:\s*hidden/);
    expect(bodyBlock).not.toMatch(/overflow-x:\s*hidden/);
  });

  it('keeps traveler main on overflow-x-clip', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    expect(app).toMatch(/id="main-content"[^>]*overflow-x-clip/);
    expect(app).not.toMatch(/id="main-content"[^>]*overflow-x-hidden/);
  });

  it('retains overscroll-behavior without locking document overflow', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const preamble = css.slice(0, css.indexOf('@layer base'));
    expect(preamble).toMatch(/html\s*\{[^}]*overscroll-behavior-y:\s*none/s);
    expect(preamble).toMatch(/body\s*\{[^}]*overscroll-behavior-y:\s*contain/s);
  });
});
