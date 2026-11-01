import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { computeAnchoredPopoverBox } from '../../lib/anchored-popover';

describe('PartnerUnifiedEventEditPopover wiring', () => {
  it('Week and Month use the shared viewport-aware popover', () => {
    const popover = readFileSync(
      resolve(__dirname, './PartnerUnifiedEventEditPopover.tsx'),
      'utf8'
    );
    const week = readFileSync(resolve(__dirname, './PartnerUnifiedWeekView.tsx'), 'utf8');
    const month = readFileSync(
      resolve(__dirname, '../../pages/supplier/SupplierUnifiedCalendar.tsx'),
      'utf8'
    );
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');

    expect(popover).toContain('computeAnchoredPopoverBox');
    expect(popover).toContain('createPortal');
    expect(popover).toContain('useDialogFocus');
    expect(popover).toContain('PartnerUnifiedInlineAvailabilityEdit');
    expect(popover).toContain('PREFERRED_WIDTH = 340');
    // Must not mount the calendar shell class on the portal (width:100% blow-up).
    expect(popover).not.toMatch(/className=\{`[^`]*partner-unified-cal(?!__)/);
    expect(popover).toContain('partner-unified-cal__popover--anchored');

    // Portaled panel must declare its own --puc-* tokens.
    expect(css).toMatch(
      /\.partner-unified-cal__popover\s*\{[^}]*--puc-size:\s*0\.8125rem/s
    );
    expect(css).toContain('max-width: 22.5rem');

    expect(week).toContain('PartnerUnifiedEventEditPopover');
    expect(month).toContain('PartnerUnifiedEventEditPopover');
    expect(month).toContain('refreshAvailabilityLocal');
  });

  it('keeps a compact 340px panel inside a 1440×900 viewport for rightmost chips', () => {
    const box = computeAnchoredPopoverBox({
      anchorRect: {
        top: 160,
        left: 1320,
        right: 1416,
        bottom: 188,
        width: 96,
        height: 28,
      },
      viewportWidth: 1440,
      viewportHeight: 900,
      preferredWidth: 340,
      estimatedHeight: 280,
      edge: 10,
      gap: 6,
    });
    expect(box.mode).toBe('popover');
    if (box.mode === 'popover') {
      expect(box.width).toBeLessThanOrEqual(340);
      expect(box.width).toBeGreaterThanOrEqual(300);
      expect(box.left).toBeGreaterThanOrEqual(10);
      expect(box.left + box.width).toBeLessThanOrEqual(1430);
      expect(box.maxHeight).toBeGreaterThan(120);
      expect(box.top + Math.min(box.maxHeight, 280)).toBeLessThanOrEqual(890);
    }
  });
});
