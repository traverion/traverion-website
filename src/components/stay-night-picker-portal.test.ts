import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('StayNightPicker portal wiring', () => {
  it('uses onSelect for day buttons and portals the calendar overlay', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'StayNightPicker.tsx'), 'utf8');
    expect(src).toMatch(/createPortal/);
    expect(src).toMatch(/planStayNightPick/);
    expect(src).toMatch(/onSelect=\{pick\}/);
    expect(src).not.toMatch(/onClick=\{\(\) => pick/);
    expect(src).toMatch(/STAY_MAX_OCCUPIED_NIGHTS|planStayNightPick/);
  });

  it('re-anchors with scroll capture, visualViewport and measured height', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'StayNightPicker.tsx'), 'utf8');
    expect(src).toMatch(/computeAnchoredPopoverBox/);
    expect(src).toMatch(/position:\s*['"]fixed['"]/);
    expect(src).toMatch(/addEventListener\('scroll',\s*schedule,\s*true\)/);
    expect(src).toMatch(/visualViewport/);
    expect(src).toMatch(/ResizeObserver/);
    expect(src).toMatch(/requestAnimationFrame/);
    expect(src).toMatch(/maxHeight/);
    expect(src).toMatch(/rafLoop/);
  });
});
