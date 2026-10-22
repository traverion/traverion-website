import { useMemo, useState } from 'react';
import NoticeCallout from './NoticeCallout';
import type { BookingRow } from '../data/supabase-bookings';
import {
  SUPPORT_CASE_REASONS,
  openBookingSupportCase,
  supportCaseReasonLabel,
  supportCaseStatusLabel,
  type BookingSupportCaseRow,
  type SupportCaseReasonCode,
} from '../data/supabase-support-cases';
import { userFacingError } from '../lib/userFacingError';

type Props = {
  booking: BookingRow;
  cases: BookingSupportCaseRow[];
  onContactOperator: () => void;
  onContactSupport: () => void;
  onOpened: () => void;
};

export default function BookingSupportCasePanel({
  booking,
  cases,
  onContactOperator,
  onContactSupport,
  onOpened,
}: Props) {
  const [openForm, setOpenForm] = useState(false);
  const [reason, setReason] = useState<SupportCaseReasonCode>('operator_no_show');
  const [description, setDescription] = useState('');
  const [evidence, setEvidence] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successRef, setSuccessRef] = useState<string | null>(null);

  const latest = useMemo(() => cases[0] ?? null, [cases]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await openBookingSupportCase({
      bookingId: booking.id,
      reasonCode: reason,
      description,
      evidenceNotes: evidence.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError(userFacingError(res.error, 'Could not open a support case.'));
      return;
    }
    setSuccessRef(res.publicReference ?? null);
    setOpenForm(false);
    setDescription('');
    setEvidence('');
    onOpened();
  };

  return (
    <div className="space-y-3 rounded-lg border border-black/[0.06] bg-white/70 p-3.5 sm:p-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="tv-btn-secondary" onClick={onContactOperator}>
          Contact operator
        </button>
        <button type="button" className="tv-btn-ghost" onClick={onContactSupport}>
          Contact Traverion Support
        </button>
        <button
          type="button"
          className="tv-btn-ghost"
          onClick={() => {
            setOpenForm((v) => !v);
            setError(null);
          }}
        >
          Report a booking problem
        </button>
      </div>

      {successRef ? (
        <NoticeCallout title="Support case submitted" tone="ok">
          Reference <span className="font-mono font-semibold">{successRef}</span>. We will keep you
          updated in Trips.
        </NoticeCallout>
      ) : null}

      {latest ? (
        <NoticeCallout title={`Case ${latest.public_reference}`} tone="info">
          <p className="text-sm">
            {supportCaseStatusLabel(latest.status)}
            {latest.resolution_code === 'full_refund' || latest.resolution_code === 'partial_refund'
              ? ' · Refund processing where approved — Refunded appears after Stripe confirms.'
              : null}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {supportCaseReasonLabel(latest.reason_code)}
            {latest.resolution_note ? ` — ${latest.resolution_note}` : null}
          </p>
        </NoticeCallout>
      ) : null}

      {openForm ? (
        <div className="space-y-3 border-t border-black/[0.05] pt-3">
          <p className="text-sm text-ink-muted">
            Tell us what went wrong. Traverion Support reviews every case. For no-shows we aim to
            resolve within 48 hours after your report.
          </p>
          <label className="block text-sm font-semibold text-ink">
            Reason
            <select
              className="tv-input mt-1"
              value={reason}
              onChange={(e) => setReason(e.target.value as SupportCaseReasonCode)}
            >
              {SUPPORT_CASE_REASONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-ink">
            Description
            <textarea
              className="tv-input mt-1 min-h-[6rem]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened, when, and what you expected…"
              maxLength={4000}
            />
          </label>
          <label className="block text-sm font-semibold text-ink">
            Supporting details (optional)
            <textarea
              className="tv-input mt-1 min-h-[4rem]"
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="Times, locations, message screenshots described in words…"
              maxLength={4000}
            />
          </label>
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          <button
            type="button"
            className="tv-btn-primary"
            disabled={busy || description.trim().length < 20}
            onClick={() => void submit()}
          >
            {busy ? 'Submitting…' : 'Submit support case'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
