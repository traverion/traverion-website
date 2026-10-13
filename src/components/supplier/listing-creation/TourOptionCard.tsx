import type { ReactNode } from 'react';
import type { TourOptionCardModel } from '../../../lib/listing-option-card';
import type { TourOptionReadiness } from '../../../lib/listing-option-scenes';

/**
 * Compact option summary on the Options step.
 * Bold title, muted facts, one primary CTA, labeled Edit / Duplicate / Delete once each.
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
  const { cta, rows } = model;
  const statusLabel = readiness === 'draft' ? 'Draft' : model.statusLabel;
  const showPrimary = cta.kind === 'add_schedule' || cta.kind === 'finish_schedule' || cta.kind === 'continue_setup';
  const showSchedules = cta.kind === 'manage_schedules';

  return (
    <article
      className="rounded-lg border border-black/[0.08] bg-white px-3.5 py-3 sm:px-4"
      aria-label={`Option ${name || 'Untitled option'}, ${statusLabel}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="min-w-0 truncate text-[15px] font-semibold tracking-tight text-ink">
          {name || 'Untitled option'}
        </h3>
        <p
          className={`shrink-0 text-[12px] ${
            readiness === 'ready' ? 'text-ink-muted' : 'font-medium text-ink'
          }`}
        >
          {statusLabel}
        </p>
      </div>

      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.id} className="min-w-0 text-[12.5px] leading-snug">
            <dt className="sr-only">{row.label}</dt>
            <dd className="truncate text-ink" title={row.text}>
              <span className="text-ink-muted">{row.label} · </span>
              {row.text}
            </dd>
          </div>
        ))}
      </dl>

      {pendingDelete ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/[0.06] pt-2.5">
          {deleteNotice}
          <p className="mr-auto text-[12.5px] text-ink">Delete this option?</p>
          <button
            type="button"
            onClick={onCancelDelete}
            className="lux-flat inline-flex min-h-8 items-center rounded-md px-2 text-[12.5px] font-medium text-ink-muted hover:bg-black/[0.04] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland/30"
          >
            Keep
          </button>
          <button
            type="button"
            onClick={onConfirmDelete}
            className="lux-flat inline-flex min-h-8 items-center rounded-md px-2 text-[12.5px] font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
          >
            Delete
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-black/[0.06] pt-2">
          {showPrimary ? (
            <button
              type="button"
              onClick={onPrimary}
              className="tv-btn-primary !min-h-8 mr-1 !px-2.5 text-[12.5px]"
            >
              {cta.label}
            </button>
          ) : null}
          {showSchedules ? (
            <button
              type="button"
              onClick={onPrimary}
              className="lux-flat inline-flex min-h-8 items-center rounded-md px-2 text-[12.5px] font-medium text-finland hover:bg-finland/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland/30"
            >
              {cta.label}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onEdit}
            className="lux-flat inline-flex min-h-8 items-center rounded-md px-2 text-[12.5px] font-medium text-ink-muted hover:bg-black/[0.04] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland/30"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            className="lux-flat inline-flex min-h-8 items-center rounded-md px-2 text-[12.5px] font-medium text-ink-muted hover:bg-black/[0.04] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland/30"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={onRequestDelete}
            className="lux-flat inline-flex min-h-8 items-center rounded-md px-2 text-[12.5px] font-medium text-ink-muted hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
          >
            Delete
          </button>
        </div>
      )}
    </article>
  );
}
