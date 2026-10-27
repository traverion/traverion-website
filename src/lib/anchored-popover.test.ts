import { describe, expect, it } from 'vitest';
import { computeAnchoredActionMenuBox, computeAnchoredPopoverBox } from './anchored-popover';

function rect(x: number, y: number, w: number, h: number): DOMRect {
  return {
    x,
    y,
    width: w,
    height: h,
    top: y,
    left: x,
    right: x + w,
    bottom: y + h,
    toJSON: () => ({}),
  };
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
      expect(box.top).toBe(80 + 44 + 8);
      expect(box.maxHeight).toBeGreaterThanOrEqual(360);
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

  it('never pins below-placement top to the viewport bottom edge', () => {
    // Anchor near the bottom with a short estimated height that still prefers below.
    const box = computeAnchoredPopoverBox({
      anchorRect: rect(40, 640, 280, 44),
      viewportWidth: 1280,
      viewportHeight: 800,
      preferredWidth: 320,
      estimatedHeight: 100,
      gap: 8,
      edge: 8,
    });
    expect(box.mode).toBe('popover');
    if (box.mode === 'popover') {
      expect(box.placement).toBe('below');
      expect(box.top).toBe(640 + 44 + 8);
      expect(box.top + Math.min(box.maxHeight, 100)).toBeLessThanOrEqual(800 - 8);
      // Must not equal viewportHeight - edge (old buggy clamp).
      expect(box.top).not.toBe(800 - 8);
    }
  });

  it('clamps maxHeight when the panel cannot fully fit either side', () => {
    // Mid-viewport with a very tall panel — prefer the larger side but clamp height.
    const box = computeAnchoredPopoverBox({
      anchorRect: rect(40, 300, 280, 44),
      viewportWidth: 1280,
      viewportHeight: 700,
      preferredWidth: 320,
      estimatedHeight: 520,
    });
    expect(box.mode).toBe('popover');
    if (box.mode === 'popover') {
      expect(box.maxHeight).toBeLessThan(520);
      expect(box.top).toBeGreaterThanOrEqual(8);
      expect(box.top + box.maxHeight).toBeLessThanOrEqual(700 - 8 + 0.5);
    }
  });
});

describe('computeAnchoredActionMenuBox', () => {
  it('places below and end-aligns to the trigger on desktop', () => {
    const box = computeAnchoredActionMenuBox({
      anchorRect: rect(900, 120, 44, 44),
      viewportWidth: 1280,
      viewportHeight: 900,
      preferredWidth: 184,
      estimatedHeight: 104,
      align: 'end',
    });
    expect(box.placement).toBe('below');
    expect(box.top).toBe(120 + 44 + 6);
    expect(box.left + box.width).toBe(900 + 44);
    expect(box.width).toBe(184);
  });

  it('flips above when space below is tight', () => {
    const box = computeAnchoredActionMenuBox({
      anchorRect: rect(300, 720, 44, 44),
      viewportWidth: 390,
      viewportHeight: 780,
      preferredWidth: 184,
      estimatedHeight: 104,
      align: 'end',
      gap: 6,
      edge: 8,
    });
    expect(box.placement).toBe('above');
    expect(box.top).toBeLessThan(720);
    expect(box.top + 104).toBeLessThanOrEqual(720 - 6 + 0.5);
  });

  it('keeps the menu inside the viewport on narrow screens', () => {
    const box = computeAnchoredActionMenuBox({
      anchorRect: rect(320, 100, 44, 44),
      viewportWidth: 360,
      viewportHeight: 640,
      preferredWidth: 184,
      estimatedHeight: 104,
      align: 'end',
      edge: 8,
    });
    expect(box.left).toBeGreaterThanOrEqual(8);
    expect(box.left + box.width).toBeLessThanOrEqual(360 - 8);
  });

  it('start-aligns suggestion menus to the field', () => {
    const box = computeAnchoredActionMenuBox({
      anchorRect: rect(24, 200, 320, 44),
      viewportWidth: 1280,
      viewportHeight: 900,
      preferredWidth: 320,
      estimatedHeight: 220,
      align: 'start',
    });
    expect(box.placement).toBe('below');
    expect(box.left).toBe(24);
    expect(box.width).toBe(320);
  });
});
