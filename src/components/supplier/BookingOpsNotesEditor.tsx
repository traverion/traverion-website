/**
 * Supplier-only private booking notes — full booking details, never customer chat.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  deleteSupplierBookingOpsNote,
  fetchSupplierBookingOpsNotes,
  upsertSupplierBookingOpsNote,
} from '../../data/supabase-booking-ops-notes';

type Props = {
  supplierId: string;
  bookingId: string;
  canEdit: boolean;
};

export default function BookingOpsNotesEditor({ supplierId, bookingId, canEdit }: Props) {
  const [note, setNote] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDirty(false);
    void fetchSupplierBookingOpsNotes(supplierId, [bookingId]).then((map) => {
      if (cancelled) return;
      const row = map[bookingId];
      setNote(row?.note ?? '');
      setSavedAt(row?.updatedAt ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [supplierId, bookingId]);

  const save = useCallback(async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError(null);
    const trimmed = note.trim();
    const ok = trimmed
      ? await upsertSupplierBookingOpsNote(supplierId, bookingId, trimmed)
      : await deleteSupplierBookingOpsNote(supplierId, bookingId);
    setSaving(false);
    if (!ok) {
      setError('Could not save private note. Try again.');
      return;
    }
    setNote(trimmed);
    setSavedAt(trimmed ? new Date().toISOString() : null);
    setDirty(false);
  }, [canEdit, saving, note, supplierId, bookingId]);

  return (
    <section className="tour-ops-detail__section" aria-label="Private supplier notes">
      <h2 className="tour-ops-detail__heading">Private notes</h2>
      <p className="tour-ops-detail__muted mb-2">
        Visible only to your team. Never shown to the traveler or in messages.
      </p>
      {loading ? (
        <div className="h-16 rounded-md bg-black/[0.04] animate-pulse" aria-busy="true" />
      ) : (
        <>
          <label htmlFor={`booking-ops-note-${bookingId}`} className="sr-only">
            Private supplier notes for this booking
          </label>
          <textarea
            id={`booking-ops-note-${bookingId}`}
            className="tour-ops-detail__ops-note"
            rows={3}
            maxLength={4000}
            value={note}
            disabled={!canEdit || saving}
            placeholder={canEdit ? 'Add a private ops note…' : 'No private note'}
            onChange={(e) => {
              setNote(e.target.value);
              setDirty(true);
            }}
          />
          {canEdit ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="tv-btn-secondary h-8 !px-2.5 text-[12.5px]"
                disabled={saving || !dirty}
                onClick={() => void save()}
              >
                {saving ? 'Saving…' : 'Save note'}
              </button>
              {savedAt && !dirty ? (
                <span className="text-[12px] font-medium text-emerald-800" role="status">
                  Saved{' '}
                  {new Date(savedAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="mt-1.5 text-[12.5px] text-ink-muted">
              Your role can read notes but cannot edit them.
            </p>
          )}
          {error ? (
            <p className="mt-1.5 text-xs text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
