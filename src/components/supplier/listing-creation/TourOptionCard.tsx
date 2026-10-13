import { CalendarDays, Clock, Copy, MapPin, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TourOptionCardModel, TourOptionCardRowId } from '../../../lib/listing-option-card';
import type { TourOptionReadiness } from '../../../lib/listing-option-scenes';
import { tourOptionReadinessLabel } from '../../../lib/listing-option-scenes';

const ROW_ICON: Record<TourOptionCardRowId, typeof Clock> = {
  duration: Clock,
  meeting: MapPin,
  pricing: Tags,
  availability: CalendarDays,
};

/**
 * Compact option summary on the Options step.
 * Header + concise facts + one primary action; Edit / Duplicate / Delete stay secondary.
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
  const statusLabel =
    readiness === 'ready' ? 'Ready' : readiness === 'draft' ? 'Draft' : 'Needs setup';

  return (
    <article
      className={`rounded-xl border px-3.5 py-3 sm:px-4 ${
        ready
          ? 'border-black/[0.08] bg-white/70'
          : 'border-amber-200/80 bg-amber-50/25'
      }`}
      aria-label={`Option ${name || 'Untitled option'}, ${tourOptionReadinessLabel(readiness)}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[14px] font-semibold tracking-tight text-ink">
              {name || 'Untitled option'}
            </h3>
            <span
              className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ${
                ready
                  ? 'bg-finland/10 text-finland'
                  : readiness === 'draft'
                    ? 'bg-black/[0.05] text-ink-muted'
                    : 'bg-amber-100/80 text-amber-900'
              }`}
            >
              {statusLabel}
            </span>
          </div>
        </div>
        {!pendingDelete ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={onEdit}
              className="lux-flat inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-black/[0.04] hover:text-ink"
              aria-label="Edit option"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={onDuplicate}
              className="lux-flat inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-black/[0.04] hover:text-ink"
              aria-label="Duplicate option"
              title="Duplicate"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={onRequestDelete}
              className="lux-flat inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-red-50 hover:text-red-700"
              aria-label="Delete option"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      <dl className="mt-2.5 grid grid-cols-1 gap-x-5 gap-y-1.5 sm:grid-cols-2">
        {model.rows.map((row) => {
          const Icon = ROW_ICON[row.id];
          return (
            <div key={row.id} className="flex min-w-0 items-start gap-2">
              <Icon
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${row.ok ? 'text-ink-faint' : 'text-amber-700'}`}
                strokeWidth={2}
                aria-hidden
              />
              <div className="min-w-0">
                <dt className="sr-only">{row.label}</dt>
                <dd
                  className={`truncate text-[12.5px] leading-snug ${
                    row.ok ? 'text-ink' : 'text-amber-900'
                  }`}
                  title={row.text}
                >
                  <span className="text-ink-muted">{row.label}: </span>
                  {row.text}
                </dd>
              </div>
            </div>
          );
        })}
      </dl>

      {pendingDelete ? (
        <div className="mt-3 space-y-2 border-t border-black/[0.06] pt-2.5">
          {deleteNotice}
          <p className="text-[12.5px] text-ink">Delete this option?</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onCancelDelete} className="tv-btn-ghost !min-h-9">
              Keep
            </button>
            <button type="button" onClick={onConfirmDelete} className="partner-btn-danger lux-flat !min-h-9">
              Delete option
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/[0.06] pt-2.5">
          {cta.kind !== 'none' ? (
            <button
              type="button"
              onClick={onPrimary}
              className="tv-btn-primary !min-h-9 inline-flex items-center gap-1.5 !px-3 text-[12.5px]"
            >
              {cta.kind === 'add_schedule' ? (
                <Plus className="h-3.5 w-3.5" aria-hidden />
              ) : cta.kind === 'manage_schedules' ? (
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              ) : null}
              {cta.label}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onEdit}
            className="tv-btn-ghost !min-h-9 inline-flex items-center gap-1 !px-2.5 text-[12.5px]"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Edit details
          </button>
        </div>
      )}
    </article>
  );
}
