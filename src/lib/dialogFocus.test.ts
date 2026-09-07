import { describe, expect, it } from 'vitest';
import { contrastRatio, tabWrapTarget } from './dialogFocus';

describe('tabWrapTarget', () => {
  it('wraps from last to first on Tab', () => {
    expect(
      tabWrapTarget({
        shiftKey: false,
        itemCount: 3,
        activeIsFirst: false,
        activeIsLast: true,
        activeOutside: false,
      }),
    ).toBe('first');
  });

  it('wraps from first to last on Shift+Tab', () => {
    expect(
      tabWrapTarget({
        shiftKey: true,
        itemCount: 3,
        activeIsFirst: true,
        activeIsLast: false,
        activeOutside: false,
      }),
    ).toBe('last');
  });

  it('does not wrap in the middle', () => {
    expect(
      tabWrapTarget({
        shiftKey: false,
        itemCount: 3,
        activeIsFirst: false,
        activeIsLast: false,
        activeOutside: false,
      }),
    ).toBe(null);
  });

  it('pulls focus back in if Tab starts outside the dialog', () => {
    expect(
      tabWrapTarget({
        shiftKey: false,
        itemCount: 2,
        activeIsFirst: false,
        activeIsLast: false,
        activeOutside: true,
      }),
    ).toBe('first');
  });
});

describe('paper contrast', () => {
  const paper = '#f6f3ee';
  const ink = '#1c1917';
  const muted = '#57534e';
  const faint = '#6b6560';
  const finland = '#003580';

  it('body ink and muted labels meet WCAG AA on paper', () => {
    expect(contrastRatio(ink, paper)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(muted, paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(faint, paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#ffffff', finland)).toBeGreaterThanOrEqual(4.5);
  });
});
