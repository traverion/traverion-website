import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

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

    expect(popover).toContain('computeAnchoredPopoverBox');
    expect(popover).toContain('createPortal');
    expect(popover).toContain('useDialogFocus');
    expect(popover).toContain('PartnerUnifiedInlineAvailabilityEdit');

    expect(week).toContain('PartnerUnifiedEventEditPopover');
    expect(week).toContain('partner-unified-cal__week-popover');

    expect(month).toContain('PartnerUnifiedEventEditPopover');
    expect(month).toContain('MonthEventChip');
    expect(month).toContain('refreshAvailabilityLocal');
    expect(month).not.toMatch(/ref=\{popoverRef\}/);
  });
});
