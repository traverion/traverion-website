import { describe, expect, it } from 'vitest';
import {
  formatDocumentSize,
  onboardingDocumentState,
  registrationDocumentFileError,
  registrationDocumentGuidance,
} from './onboarding-document';

describe('onboarding document status', () => {
  it('does not treat a saved file as approved or under review', () => {
    expect(
      onboardingDocumentState({
        uploading: false,
        path: 'supplier/company-registration.pdf',
        verificationStatus: 'pending',
        submittedAt: null,
      })
    ).toBe('uploaded');
  });

  it('uses the company verification record for review, approval, and action required', () => {
    expect(
      onboardingDocumentState({
        uploading: false,
        path: 'supplier/company-registration.pdf',
        verificationStatus: 'pending',
        submittedAt: '2026-01-01',
      })
    ).toBe('under_review');
    expect(
      onboardingDocumentState({
        uploading: false,
        path: 'supplier/company-registration.pdf',
        verificationStatus: 'verified',
        submittedAt: '2026-01-01',
      })
    ).toBe('approved');
    expect(
      onboardingDocumentState({
        uploading: false,
        path: 'supplier/company-registration.pdf',
        verificationStatus: 'rejected',
        submittedAt: '2026-01-01',
      })
    ).toBe('action_required');
  });

  it('explains the Finnish extract and rejects an oversized file', () => {
    expect(registrationDocumentGuidance('Finland').example).toContain('PRH');
    expect(registrationDocumentGuidance('SE').example).not.toContain('PRH');
    expect(registrationDocumentFileError({ name: 'extract.pdf', size: 6 * 1024 * 1024, type: 'application/pdf' })).toMatch(
      /5 MB/
    );
    expect(registrationDocumentFileError({ name: 'notes.txt', size: 100, type: 'text/plain' })).toMatch(/PDF/);
    expect(formatDocumentSize(240 * 1024)).toBe('240 KB');
  });
});
