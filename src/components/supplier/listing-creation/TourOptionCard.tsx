import { AlertCircle, Check, Copy, Pencil, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TourOptionCardModel } from '../../../lib/listing-option-card';
import type { TourOptionReadiness } from '../../../lib/listing-option-scenes';
import { tourOptionReadinessLabel } from '../../../lib/listing-option-scenes';

/**
 * Option card on the Options step: structured status rows + a primary CTA that matches what is missing.
 * Edit stays available as a secondary action.
 */
export function TourOptionCard({
  name,
  readiness,
  model,
  pendingDelete,
  deleteNotice,
  onPrimary,
  onEdit,
  onDuplicate,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  name: string;
  readiness: TourOptionReadiness;
  model: TourOptionCardModel;
  pendingDelete: boolean;
  deleteNotice: ReactNode;
  onPrimary: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const ready = readiness === 'ready';
  const { cta } = model;

  return (
    <article
      className={`lc-tile rounded-xl px-4 py-4 sm:px-5 ${ready ? '' : 'lc-tile--attention'}`}
      aria-label={`Option ${name || 'Untitled option'}, ${tourOptionReadinessLabel(readiness)}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-ink">{name || 'Untitled option'}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em]">
            {ready ? (
              <span className="inline-flex items-center gap-1 text-finland">
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                Ready to book
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-800">
                <AlertCircle className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                {readiness === 'draft' ? 'Draft' : 'Needs work'}
              </span>
            )}
          </p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {model.rows.map((row) => (
          <div key={row.id} className="flex min-w-0 items-start gap-2">
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                row.ok ? 'bg-finland text-white' : 'border border-amber-500/70 bg-amber-50 text-amber-800'
              }`}
              aria-hidden
            >
              {row.ok ? (
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              ) : (
                <span className="block h-1 w-1 rounded-full bg-amber-600" />
              )}
            </span>
            <div className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                {row.label}
                <span className="sr-only">{row.ok ? ', complete' : ', needs attention'}</span>
              </dt>
              <dd className={`text-sm leading-snug ${row.ok ? 'text-ink' : 'text-ink-muted'}`}>{row.text}</dd>
            </div>
          </div>
        ))}
      </dl>

      {pendingDelete ? (
        <div className="mt-4 space-y-3">
          {deleteNotice}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onCancelDelete} className="tv-btn-ghost !min-h-11">
              Keep
            </button>
            <button
              type="button"
              onClick={onConfirmDelete}
              className="lc-btn-danger inline-flex min-h-[44px] items-center rounded-lg px-3 py-2 text-xs font-medium"
            >
              Delete option
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 border-t border-black/[0.06] pt-3">
          {cta.kind !== 'none' ? (
            <p className="mb-2 text-xs leading-relaxed text-ink-muted" role="status">
              {cta.reason}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {cta.kind !== 'none' ? (
              <button type="button" onClick={onPrimary} className="tv-btn-primary !min-h-11">
                {cta.label}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onEdit}
              className={`${cta.kind === 'none' ? 'tv-btn-secondary' : 'tv-btn-ghost'} !min-h-11`}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit
            </button>
            <button type="button" onClick={onDuplicate} className="tv-btn-ghost !min-h-11">
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Duplicate
            </button>
            <button
              type="button"
              onClick={onRequestDelete}
              className="lc-btn-danger inline-flex min-h-[44px] items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
