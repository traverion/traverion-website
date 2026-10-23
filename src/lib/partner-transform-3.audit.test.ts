import { describe, expect, it } from 'vitest';
import {
  PARTNER_TRANSFORM_3_AUDIT,
  TRANSFORM3_NESTED_SURFACES,
  TRANSFORM3_PHASE_CHECKLIST,
  TRANSFORM3_SUPPLIER_ROUTES,
} from './partner-transform-3.audit';
import { PARTNER_SECTION_TITLES } from './partnerNav';

describe('Transform 3.0 Phase 01 audit inventory', () => {
  it('exports a locked audit marker and covers every PartnerNavSectionId title', () => {
    expect(PARTNER_TRANSFORM_3_AUDIT).toBe(true);
    expect(TRANSFORM3_SUPPLIER_ROUTES.length).toBeGreaterThanOrEqual(18);
    expect(TRANSFORM3_NESTED_SURFACES.length).toBeGreaterThanOrEqual(10);
    expect(TRANSFORM3_PHASE_CHECKLIST['01_audit']).toBe('done');
    for (const route of TRANSFORM3_SUPPLIER_ROUTES) {
      expect(PARTNER_SECTION_TITLES[route.id]).toBeTruthy();
    }
  });
});
