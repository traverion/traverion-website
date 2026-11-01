import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('PartnerUnifiedAgendaTourControls', () => {
  it('wires inline tour ops into Agenda cards only', () => {
    const controls = readFileSync(resolve(__dirname, 'PartnerUnifiedAgendaTourControls.tsx'), 'utf8');
    const page = readFileSync(
      resolve(__dirname, '../../pages/supplier/SupplierUnifiedCalendar.tsx'),
      'utf8'
    );
    const week = readFileSync(resolve(__dirname, 'PartnerUnifiedWeekView.tsx'), 'utf8');

    expect(controls).toContain('partnerUnifiedSetTourDayClosed');
    expect(controls).toContain('partnerUnifiedSaveTourDepartureWithListing');
    expect(controls).toContain('/ {capacity} booked');
    expect(controls).toContain('cutoffClockLabel');
    expect(controls).toContain("Math.max(1, booked)");

    expect(page).toContain('PartnerUnifiedAgendaTourControls');
    expect(page).toContain("event.kind === 'tour_departure'");
    expect(page).toContain('partner-unified-cal__card-main--tour-ops');
    // Stays/rentals keep expand + inline availability panel.
    expect(page).toContain('PartnerUnifiedInlineAvailabilityEdit');

    // Week/Month must not mount agenda tour ops.
    expect(week).not.toContain('PartnerUnifiedAgendaTourControls');
    expect(page).toContain("view === 'agenda'");
    expect(page).toContain('PartnerUnifiedWeekView');
    // Tour ops JSX only appears in the agenda branch (before week view mount).
    const tourOpsJsx = page.indexOf('<PartnerUnifiedAgendaTourControls');
    const weekViewJsx = page.indexOf('<PartnerUnifiedWeekView');
    expect(tourOpsJsx).toBeGreaterThan(-1);
    expect(weekViewJsx).toBeGreaterThan(tourOpsJsx);
  });
});
