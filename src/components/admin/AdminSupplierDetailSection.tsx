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
      <p className="text-sm text-gray-500 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        Loading profile…
      </p>
    );
  }
  if (!detail) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {detail.documents.identity?.signedUrl && (
          <a
            href={detail.documents.identity.signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-800 text-xs font-medium hover:bg-slate-200"
          >
            <FileText className="w-3.5 h-3.5" aria-hidden />
            Identity document
            <ExternalLink className="w-3 h-3 opacity-70" aria-hidden />
          </a>
        )}
        {detail.documents.identity?.path && !detail.documents.identity.signedUrl && (
          <span className="text-xs text-amber-700">Identity file on file (could not sign URL)</span>
        )}
        {detail.documents.company_registration?.signedUrl && (
          <a
            href={detail.documents.company_registration.signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-800 text-xs font-medium hover:bg-slate-200"
          >
            <FileText className="w-3.5 h-3.5" aria-hidden />
            Company registration
            <ExternalLink className="w-3 h-3 opacity-70" aria-hidden />
          </a>
        )}
        {detail.documents.company_registration?.path && !detail.documents.company_registration.signedUrl && (
          <span className="text-xs text-amber-700">Registration file on file (could not sign URL)</span>
        )}
        {!detail.documents.identity && !detail.documents.company_registration && (
          <span className="text-xs text-gray-500">No verification documents uploaded.</span>
        )}
      </div>
      {detail.signedUrlExpiresInSeconds != null && (
        <p className="text-xs text-gray-400">
          Document links expire in about {Math.round(detail.signedUrlExpiresInSeconds / 60)} minutes.
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {Object.entries(detail.profile)
          .filter(([k]) => !ADMIN_SUPPLIER_DETAIL_SKIP.has(k))
          .map(([k, v]) => (
            <div key={k} className="flex flex-col sm:flex-row sm:gap-2 border-b border-gray-50 pb-1">
              <span className="text-gray-500 shrink-0 w-44">{adminSupplierDetailFormatLabel(k)}</span>
              <span className="text-gray-900 break-words">
                {v === null || v === undefined || v === '' ? '—' : String(v)}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
