import { useCallback, useEffect, useState } from 'react';
import {
  fetchSupplierOpenSupportCases,
  respondBookingSupportCase,
  supportCaseReasonLabel,
  supportCaseStatusLabel,
  type BookingSupportCaseRow,
} from '../../data/supabase-support-cases';
import { userFacingError } from '../../lib/userFacingError';
import NoticeCallout from '../NoticeCallout';

type Props = {
  supplierId: string | null | undefined;
};

export default function SupplierSupportCaseRespond({ supplierId }: Props) {
  const [cases, setCases] = useState<BookingSupportCaseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supplierId) {
      setCases([]);
      return;
    }
    try {
      setError(null);
      setCases(await fetchSupplierOpenSupportCases(supplierId));
    } catch (e) {
      setError(userFacingError(e, 'Could not load support cases.'));
    }
  }, [supplierId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!supplierId) return null;
  if (cases.length === 0 && !error) return null;

  return (
    <section className="mb-6 rounded-xl border border-amber-200/70 bg-amber-50/40 p-4">
      <h2 className="text-base font-semibold text-ink">Customer support cases</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Respond with facts and evidence notes. You cannot delete customer case history.
      </p>
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      <ul className="mt-3 space-y-3">
        {cases.map((c) => (
          <li key={c.id} className="rounded-lg border border-black/[0.06] bg-white p-3">
            <p className="font-mono text-xs font-semibold text-finland">{c.public_reference}</p>
            <p className="mt-1 text-sm font-semibold">
              {supportCaseReasonLabel(c.reason_code)} · {supportCaseStatusLabel(c.status)}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{c.description}</p>
            {c.supplier_response ? (
              <NoticeCallout title="Your response on file" tone="info">
                {c.supplier_response}
              </NoticeCallout>
            ) : (
              <>
                <textarea
                  className="tv-input mt-2 min-h-[4.5rem]"
                  placeholder="Explain what happened from your side…"
                  value={drafts[c.id] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                />
                <button
                  type="button"
                  className="tv-btn-secondary mt-2"
                  disabled={busyId === c.id || (drafts[c.id] ?? '').trim().length < 12}
                  onClick={async () => {
                    setBusyId(c.id);
                    const res = await respondBookingSupportCase({
                      caseId: c.id,
                      response: (drafts[c.id] ?? '').trim(),
                    });
                    setBusyId(null);
                    if (!res.ok) {
                      setError(userFacingError(res.error, 'Could not send response.'));
                      return;
                    }
                    await load();
                  }}
                >
                  {busyId === c.id ? 'Sending…' : 'Send response to Traverion Support'}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
