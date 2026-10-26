import { describe, expect, it } from 'vitest';
import {
  TRAVERION_SUPABASE_PROJECT_REF_META,
  checkoutEnvironmentMetadata,
  metadataProjectRef,
  projectRefFromSupabaseUrl,
  resolveExpectedTraverionProjectRef,
  stripeEventOwnershipDecision,
} from './stripe-environment-guard';

describe('projectRefFromSupabaseUrl', () => {
  it('parses standard supabase host', () => {
    expect(projectRefFromSupabaseUrl('https://gedktutbpfwnstcbffsc.supabase.co')).toBe(
      'gedktutbpfwnstcbffsc'
    );
    expect(projectRefFromSupabaseUrl('https://xcopqllkulxfkpunetbc.supabase.co/')).toBe(
      'xcopqllkulxfkpunetbc'
    );
  });

  it('returns null for empty or non-supabase hosts', () => {
    expect(projectRefFromSupabaseUrl('')).toBeNull();
    expect(projectRefFromSupabaseUrl('https://example.com')).toBeNull();
  });
});

describe('resolveExpectedTraverionProjectRef', () => {
  it('prefers explicit env over URL', () => {
    expect(
      resolveExpectedTraverionProjectRef({
        traverionSupabaseProjectRef: 'explicitref',
        supabaseUrl: 'https://fromurl.supabase.co',
      })
    ).toBe('explicitref');
  });

  it('falls back to SUPABASE_URL', () => {
    expect(
      resolveExpectedTraverionProjectRef({
        supabaseUrl: 'https://fromurl.supabase.co',
      })
    ).toBe('fromurl');
  });
});

describe('checkoutEnvironmentMetadata', () => {
  it('stamps project ref when present', () => {
    expect(checkoutEnvironmentMetadata('abc')).toEqual({
      [TRAVERION_SUPABASE_PROJECT_REF_META]: 'abc',
    });
    expect(checkoutEnvironmentMetadata('')).toEqual({});
  });
});

describe('stripeEventOwnershipDecision', () => {
  it('ignores foreign project ref even when a booking row exists', () => {
    expect(
      stripeEventOwnershipDecision({
        expectedProjectRef: 'prodref',
        metadataProjectRef: 'stagingref',
        bookingFound: true,
      })
    ).toEqual({ action: 'ignore', reason: 'foreign_project_ref' });
  });

  it('ignores missing booking (shared-account fan-out) — never refund', () => {
    expect(
      stripeEventOwnershipDecision({
        expectedProjectRef: 'prodref',
        metadataProjectRef: 'stagingref',
        bookingFound: false,
      })
    ).toEqual({ action: 'ignore', reason: 'foreign_project_ref' });

    expect(
      stripeEventOwnershipDecision({
        expectedProjectRef: 'prodref',
        metadataProjectRef: 'prodref',
        bookingFound: false,
      })
    ).toEqual({ action: 'ignore', reason: 'booking_not_in_this_environment' });

    expect(
      stripeEventOwnershipDecision({
        expectedProjectRef: 'prodref',
        metadataProjectRef: null,
        bookingFound: false,
      })
    ).toEqual({ action: 'ignore', reason: 'booking_not_in_this_environment' });
  });

  it('accepts owned booking with matching stamp', () => {
    expect(
      stripeEventOwnershipDecision({
        expectedProjectRef: 'prodref',
        metadataProjectRef: 'prodref',
        bookingFound: true,
      })
    ).toEqual({ action: 'accept', reason: 'owned' });
  });

  it('accepts legacy sessions with booking present and no stamp', () => {
    expect(
      stripeEventOwnershipDecision({
        expectedProjectRef: 'prodref',
        metadataProjectRef: null,
        bookingFound: true,
      })
    ).toEqual({ action: 'accept', reason: 'owned' });
  });

  it('reads metadata helper', () => {
    expect(
      metadataProjectRef({ [TRAVERION_SUPABASE_PROJECT_REF_META]: 'xyz' })
    ).toBe('xyz');
    expect(metadataProjectRef({})).toBeNull();
  });
});
