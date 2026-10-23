import { describe, expect, it } from 'vitest';
import type { SupplierProfileRow } from '../data/supabase-supplier-profile';
import {
  editCategoryForRequirement,
  firstScreenForEditCategory,
  hasAuthoritativeSubmission,
  resolveVerificationWorkspacePhase,
} from './verification-workspace-lifecycle';

function profile(partial: Partial<SupplierProfileRow>): SupplierProfileRow {
  return {
    id: 'u1',
    display_name: 'Royal Nordic',
    ...partial,
  } as SupplierProfileRow;
}

describe('verification-workspace-lifecycle', () => {
  it('shows intro when nothing has started', () => {
    expect(
      resolveVerificationWorkspacePhase({
        profile: profile({ connect_onboarding_status: 'not_started' }),
        hasDraft: false,
      })
    ).toBe('intro');
  });

  it('resumes wizard from an in-progress draft', () => {
    expect(
      resolveVerificationWorkspacePhase({
        profile: profile({
          stripe_connected_account_id: 'acct_x',
          connect_onboarding_status: 'not_started',
          connect_details_submitted: false,
        }),
        hasDraft: true,
      })
    ).toBe('wizard');
  });

  it('never restarts wizard for pending / complete / restricted accounts', () => {
    for (const status of ['pending', 'complete', 'restricted', 'rejected'] as const) {
      expect(
        resolveVerificationWorkspacePhase({
          profile: profile({
            stripe_connected_account_id: 'acct_x',
            connect_onboarding_status: status,
            connect_details_submitted: status !== 'rejected',
          }),
          hasDraft: true,
        })
      ).toBe('status');
    }
  });

  it('treats details_submitted as authoritative even if status lags', () => {
    expect(
      hasAuthoritativeSubmission(
        profile({
          stripe_connected_account_id: 'acct_x',
          connect_details_submitted: true,
          connect_onboarding_status: 'not_started',
        })
      )
    ).toBe(true);
    expect(
      resolveVerificationWorkspacePhase({
        profile: profile({
          stripe_connected_account_id: 'acct_x',
          connect_details_submitted: true,
          connect_onboarding_status: 'not_started',
        }),
        hasDraft: true,
      })
    ).toBe('status');
  });

  it('honors forceWizard for targeted corrections', () => {
    expect(
      resolveVerificationWorkspacePhase({
        profile: profile({
          stripe_connected_account_id: 'acct_x',
          connect_onboarding_status: 'complete',
          connect_details_submitted: true,
        }),
        hasDraft: false,
        forceWizard: true,
      })
    ).toBe('wizard');
  });

  it('uses clientSubmitted bridge after Finish before mirror catches up', () => {
    expect(
      resolveVerificationWorkspacePhase({
        profile: profile({
          stripe_connected_account_id: 'acct_x',
          connect_onboarding_status: 'not_started',
          connect_details_submitted: false,
        }),
        hasDraft: false,
        clientSubmitted: true,
      })
    ).toBe('status');
  });

  it('maps requirements to edit screens', () => {
    expect(editCategoryForRequirement('external_account')).toBe('banking');
    expect(firstScreenForEditCategory('banking')).toBe('bank_country');
    expect(editCategoryForRequirement('individual.verification.document')).toBe('identity');
    expect(editCategoryForRequirement('tos_acceptance.date')).toBe('agreement');
  });
});
