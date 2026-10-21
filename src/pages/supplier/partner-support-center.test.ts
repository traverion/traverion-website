import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PARTNER_SUPPORT_RELATED_AREAS,
  PARTNER_SUPPORT_REQUEST_TYPES,
  isPartnerSupportRelatedArea,
  isPartnerSupportRequestType,
  partnerSupportEmailSubjectTag,
} from '../../lib/partner-support';
import { PARTNER_HELP_PATH, PARTNER_SUPPORT_PATH } from '../../lib/partnerPortalPaths';

describe('Partner Support Center', () => {
  it('exposes support as the canonical path and keeps /help as a legacy alias', () => {
    expect(PARTNER_SUPPORT_PATH).toBe('/partner/support');
    expect(PARTNER_HELP_PATH).toBe('/partner/help');
  });

  it('defines required request types and related areas', () => {
    expect(PARTNER_SUPPORT_REQUEST_TYPES.map((t) => t.value)).toEqual([
      'problem',
      'help',
      'question',
      'feature',
      'other',
    ]);
    expect(PARTNER_SUPPORT_RELATED_AREAS.length).toBeGreaterThanOrEqual(10);
    expect(isPartnerSupportRequestType('problem')).toBe(true);
    expect(isPartnerSupportRelatedArea('bookings')).toBe(true);
    expect(partnerSupportEmailSubjectTag('problem')).toBe('Problem');
  });

  it('renders a real support form without the old Help navigation cards', () => {
    const src = readFileSync(resolve(__dirname, 'PartnerSupportPage.tsx'), 'utf8');
    expect(src).toContain('Send request');
    expect(src).toContain('submitPartnerSupportRequest');
    expect(src).toContain('Your request has been sent.');
    expect(src).not.toContain('Finish setup');
    expect(src).not.toContain('mailto:');
  });

  it('invokes the authenticated submit-partner-support edge function', () => {
    const client = readFileSync(resolve(__dirname, '../../data/supabase-partner-support.ts'), 'utf8');
    expect(client).toContain('submit-partner-support');
    const edge = readFileSync(
      resolve(__dirname, '../../../supabase/functions/submit-partner-support/index.ts'),
      'utf8'
    );
    expect(edge).toContain('info@traverion.com');
    expect(edge).toContain('replyTo');
    expect(edge).toContain('partner_support_requests');
    expect(edge).toContain('claimTransactionalSend');
  });
});
