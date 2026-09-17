import { Loader2, FileText, ExternalLink } from 'lucide-react';

export type DetailProfile = Record<string, unknown>;

export type AdminSupplierDetailPayload = {
  profile: DetailProfile;
  documents: {
    identity: { path: string; signedUrl: string | null } | null;
    company_registration: { path: string; signedUrl: string | null } | null;
  };
  signedUrlExpiresInSeconds?: number;
};

export const ADMIN_SUPPLIER_DETAIL_SKIP = new Set([
  'identity_document_path',
  'company_registration_document_path',
  'business_logo_url',
]);

export function adminSupplierDetailFormatLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AdminSupplierDetailSection({
  loading,
  detail,
}: {
  loading: boolean;
  detail: AdminSupplierDetailPayload | null;
}) {
  if (loading) {
    return (
      <p className="text-sm text-ink-muted flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        Loading profile…
      </p>
    );
  }
  if (!detail) return null;

  const hasDocs = Boolean(detail.documents.identity || detail.documents.company_registration);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {detail.documents.identity?.signedUrl ? (
          <a
            href={detail.documents.identity.signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="tv-btn-secondary text-xs h-8 px-3 inline-flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" aria-hidden />
            Identity document
            <ExternalLink className="w-3 h-3 opacity-70" aria-hidden />
          </a>
        ) : null}
        {detail.documents.identity?.path && !detail.documents.identity.signedUrl ? (
          <span className="text-xs text-amber-900 bg-amber-50 ring-1 ring-amber-200/70 rounded-lg px-2.5 py-1.5">
            Identity file on file (could not sign URL)
          </span>
        ) : null}
        {detail.documents.company_registration?.signedUrl ? (
          <a
            href={detail.documents.company_registration.signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="tv-btn-secondary text-xs h-8 px-3 inline-flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" aria-hidden />
            Company registration
            <ExternalLink className="w-3 h-3 opacity-70" aria-hidden />
          </a>
        ) : null}
        {detail.documents.company_registration?.path && !detail.documents.company_registration.signedUrl ? (
          <span className="text-xs text-amber-900 bg-amber-50 ring-1 ring-amber-200/70 rounded-lg px-2.5 py-1.5">
            Registration file on file (could not sign URL)
          </span>
        ) : null}
        {!hasDocs ? (
          <p className="text-xs text-ink-faint">No verification documents uploaded.</p>
        ) : null}
      </div>
      {detail.signedUrlExpiresInSeconds != null ? (
        <p className="text-xs text-ink-faint">
          Document links expire in about {Math.round(detail.signedUrlExpiresInSeconds / 60)} minutes.
        </p>
      ) : null}
      <div className="rounded-2xl bg-paper-raised shadow-soft ring-1 ring-black/[0.06] p-3 sm:p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-finland mb-3">Supplier profile</p>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {Object.entries(detail.profile)
            .filter(([k]) => !ADMIN_SUPPLIER_DETAIL_SKIP.has(k))
            .map(([k, v]) => (
              <div key={k} className="flex flex-col sm:flex-row sm:gap-2 border-b border-black/[0.04] pb-1.5 last:border-0">
                <span className="text-ink-faint shrink-0 w-44 text-xs uppercase tracking-wide">
                  {adminSupplierDetailFormatLabel(k)}
                </span>
                <span className="text-ink break-words">
                  {v === null || v === undefined || v === '' ? '—' : String(v)}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
