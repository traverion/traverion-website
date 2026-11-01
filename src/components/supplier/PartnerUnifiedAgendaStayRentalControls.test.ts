import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('PartnerUnifiedAgenda stay/rental controls', () => {
  it('wires inline stay and rental ops into Agenda without full reload', () => {
    const stay = readFileSync(resolve(__dirname, 'PartnerUnifiedAgendaStayControls.tsx'), 'utf8');
    const rental = readFileSync(resolve(__dirname, 'PartnerUnifiedAgendaRentalControls.tsx'), 'utf8');
    const page = readFileSync(
      resolve(__dirname, '../../pages/supplier/SupplierUnifiedCalendar.tsx'),
      'utf8'
    );
    const tour = readFileSync(resolve(__dirname, 'PartnerUnifiedAgendaTourControls.tsx'), 'utf8');

    expect(stay).toContain('partnerUnifiedBlockStayNight');
    expect(stay).toContain('partnerUnifiedUnblockStayNight');
    expect(stay).toContain('canBlock');
    expect(stay).toContain('setLocalBlocked');
    expect(stay).not.toContain('refreshAfterEdit');

    expect(rental).toContain('partnerUnifiedBlockRentalDay');
    expect(rental).toContain('partnerUnifiedAdjustRentalStock');
    expect(rental).toContain('setLocalStock');
    expect(rental).not.toContain('refreshAfterEdit');

    expect(page).toContain('PartnerUnifiedAgendaStayControls');
    expect(page).toContain('PartnerUnifiedAgendaRentalControls');
    expect(page).toContain('applyStayAgendaPatch');
    expect(page).toContain('applyRentalAgendaPatch');
    expect(page).toContain("event.kind === 'stay_listing'");
    expect(page).toContain("event.kind === 'rental_listing'");

    // Tours stay on their own control path.
    expect(tour).toContain('partnerUnifiedSetTourDayClosed');
    expect(page).toContain('PartnerUnifiedAgendaTourControls');
  });
});
