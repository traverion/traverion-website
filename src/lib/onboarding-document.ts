/** Registration-document status. Approval is only the verified company record. */

export type OnboardingDocumentState =
  | 'not_uploaded'
  | 'uploading'
  | 'uploaded'
  | 'under_review'
  | 'approved'
  | 'action_required';

export const ONBOARDING_DOCUMENT_LABEL: Record<OnboardingDocumentState, string> = {
  not_uploaded: 'Not uploaded',
  uploading: 'Uploading',
  uploaded: 'Uploaded',
  under_review: 'Under review',
  approved: 'Approved',
  action_required: 'Action required',
};

export function onboardingDocumentState(input: {
  uploading: boolean;
  path: string | null | undefined;
  verificationStatus: string | null | undefined;
  submittedAt: string | null | undefined;
}): OnboardingDocumentState {
  if (input.uploading) return 'uploading';
  const path = (input.path ?? '').trim();
  if (!path) return 'not_uploaded';
  const status = (input.verificationStatus ?? '').trim().toLowerCase();
  if (status === 'verified') return 'approved';
  if (status === 'rejected' || status === 'action_required') return 'action_required';
  if (status === 'pending' && Boolean((input.submittedAt ?? '').trim())) return 'under_review';
  return 'uploaded';
}

const MAX_BYTES = 5 * 1024 * 1024;

export function registrationDocumentFileError(file: { name: string; size: number; type: string }): string | null {
  if (file.size > MAX_BYTES) return 'File must be 5 MB or smaller.';
  const name = file.name.trim().toLowerCase();
  const type = file.type.trim().toLowerCase();
  const allowed =
    type === 'application/pdf' ||
    type === 'image/jpeg' ||
    type === 'image/png' ||
    type === 'image/webp' ||
    name.endsWith('.pdf') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.png') ||
    name.endsWith('.webp');
  if (!allowed) return 'Use PDF, JPEG, PNG, or WebP.';
  return null;
}

export function registrationDocumentGuidance(country: string | null | undefined): { summary: string; example: string } {
  const code = (country ?? '').trim().toUpperCase();
  const finnish = code === 'FI' || code === 'FIN' || code === 'FINLAND' || code === 'SUOMI';
  return {
    summary:
      'Upload an official extract that shows the legal name, business ID, and registered address.',
    example: finnish
      ? 'In Finland, a PRH trade register extract is the usual document.'
      : 'Use the official company-registration extract for the country where the company is registered.',
  };
}

export function registrationDocumentIsImage(path: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(path.trim());
}

export function formatDocumentSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}
