import { describe, expect, it } from 'vitest';
import { computeAnchoredPopoverBox } from './anchored-popover';

function rect(x: number, y: number, w: number, h: number): DOMRect {
  return { x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON: () => ({}) };
}

describe('computeAnchoredPopoverBox', () => {
  it('uses a sheet on narrow viewports', () => {
    expect(
      computeAnchoredPopoverBox({
        anchorRect: rect(20, 100, 200, 44),
        viewportWidth: 390,
        viewportHeight: 800,
        preferredWidth: 320,
        estimatedHeight: 360,
      }).mode
    ).toBe('sheet');
  });

  it('places below when there is room', () => {
    const box = computeAnchoredPopoverBox({
      anchorRect: rect(40, 80, 280, 44),
      viewportWidth: 1280,
      viewportHeight: 900,
      preferredWidth: 320,
      estimatedHeight: 360,
    });
    expect(box.mode).toBe('popover');
    if (box.mode === 'popover') {
      expect(box.placement).toBe('below');
      expect(box.top).toBeGreaterThan(80);
    }
  });

  it('flips above when space below is insufficient', () => {
    const box = computeAnchoredPopoverBox({
      anchorRect: rect(40, 700, 280, 44),
      viewportWidth: 1280,
      viewportHeight: 780,
      preferredWidth: 320,
      estimatedHeight: 360,
    });
    expect(box.mode).toBe('popover');
    if (box.mode === 'popover') {
      expect(box.placement).toBe('above');
      expect(box.top).toBeLessThan(700);
    }
  });
});
