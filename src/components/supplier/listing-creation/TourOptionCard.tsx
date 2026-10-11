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
      className={`lc-tile rounded-[var(--partner-radius,0.5rem)] px-3 py-3 sm:px-3.5 ${ready ? '' : 'lc-tile--attention'}`}
      aria-label={`Option ${name || 'Untitled option'}, ${tourOptionReadinessLabel(readiness)}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold tracking-tight text-ink">{name || 'Untitled option'}</p>
          <p className="mt-0.5 flex items-center gap-1.5 partner-label">
            {ready ? (
              <span className="inline-flex items-center gap-1 text-finland">
                <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                Ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-800">
                <AlertCircle className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                {readiness === 'draft' ? 'Draft' : 'Needs work'}
              </span>
            )}
          </p>
        </div>
      </div>

      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {model.rows.map((row) => (
          <div key={row.id} className="flex min-w-0 items-start gap-1.5">
            <span
              className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full ${
                row.ok ? 'bg-finland text-white' : 'border border-amber-500/70 bg-amber-50 text-amber-800'
              }`}
              aria-hidden
            >
              {row.ok ? (
                <Check className="h-2 w-2" strokeWidth={3} />
              ) : (
                <span className="block h-1 w-1 rounded-full bg-amber-600" />
              )}
            </span>
            <div className="min-w-0">
              <dt className="partner-label">
                {row.label}
                <span className="sr-only">{row.ok ? ', complete' : ', needs attention'}</span>
              </dt>
              <dd className={`text-[13px] leading-snug ${row.ok ? 'text-ink' : 'text-ink-muted'}`}>{row.text}</dd>
            </div>
          </div>
        ))}
      </dl>

      {pendingDelete ? (
        <div className="mt-3 space-y-2">
          {deleteNotice}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onCancelDelete} className="tv-btn-ghost">
              Keep
            </button>
            <button type="button" onClick={onConfirmDelete} className="partner-btn-danger lux-flat">
              Delete option
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 border-t border-black/[0.06] pt-2.5">
          {cta.kind !== 'none' ? (
            <p className="mb-2 text-[12px] leading-snug text-ink-muted" role="status">
              {cta.reason}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            {cta.kind !== 'none' ? (
              <button type="button" onClick={onPrimary} className="tv-btn-primary">
                {cta.label}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onEdit}
              className={`${cta.kind === 'none' ? 'tv-btn-secondary' : 'tv-btn-ghost'} inline-flex items-center gap-1`}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit
            </button>
            <button type="button" onClick={onDuplicate} className="tv-btn-ghost inline-flex items-center gap-1">
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Duplicate
            </button>
            <button
              type="button"
              onClick={onRequestDelete}
              className="partner-btn-danger lux-flat inline-flex items-center gap-1"
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
