import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import type { ListingBookingOption, ListingOptionSchedule } from '../../../types/listingExtras';
import {
  listingOptionHasSchedules,
  listingOptionSchedules,
} from '../../../lib/listing-option-schedules';
import {
  canAddOptionSchedule,
  LISTING_OPTION_SCHEDULES_MAX,
  scheduleListRowModel,
  type ScheduleListStatus,
} from '../../../lib/listing-schedule-list';
import { bookingOptionSchedulePrereqIssues } from '../../../lib/listing-option-validation';

/** Soft viewport so ~5 compact rows scroll inside Availability without stretching the page. */
const SCHEDULE_LIST_SCROLL_MAX_PX = 320;

function statusClass(status: ScheduleListStatus): string {
  if (status === 'ready') return 'text-finland';
  if (status === 'incomplete') return 'text-amber-800';
  return 'text-ink-muted';
}

export function TourOptionScheduleList({
  option,
  formatAmount,
  onAdd,
  onEdit,
  onDuplicate,
  onDelete,
  pendingDeleteId,
  onCancelDelete,
  occupancyNoticeForSchedule,
}: {
  option: ListingBookingOption;
  formatAmount: (n: number) => string;
  onAdd: () => void;
  onEdit: (scheduleId: string) => void;
  onDuplicate: (scheduleId: string) => void;
  onDelete: (scheduleId: string) => void;
  pendingDeleteId: string | null;
  onCancelDelete: () => void;
  occupancyNoticeForSchedule?: (schedule: ListingOptionSchedule) => string | null;
}) {
  const rows = listingOptionHasSchedules(option) ? option.schedules ?? [] : listingOptionSchedules(option);
  const prereq = bookingOptionSchedulePrereqIssues(option);
  const prereqOk = prereq.length === 0;
  const addGate = canAddOptionSchedule(option);
  const canAdd = prereqOk && addGate.ok;
  const atLimit = !addGate.ok;

  return (
    <div id="supplier-listing-field-option-schedules" className="space-y-3.5">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 border-b border-black/[0.08] pb-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <h3 className="text-[1.05rem] font-semibold tracking-tight text-ink">Schedules</h3>
          <span className="text-[12.5px] font-medium tabular-nums text-ink-muted">
            {rows.length} of {LISTING_OPTION_SCHEDULES_MAX}
          </span>
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAdd}
          className="lux-flat inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[13px] font-semibold text-finland hover:bg-finland/[0.06] disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland/30"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add schedule
        </button>
      </div>

      {!prereqOk ? (
        <div className="rounded-lg border border-amber-200/70 bg-amber-50/50 px-3 py-2 text-[12px] text-amber-950">
          <p className="font-medium">Finish Setup and Pricing to add schedules</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {prereq.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {prereqOk && atLimit ? (
        <p className="text-[12px] leading-snug text-ink-muted" role="status">
          {addGate.reason}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-3 border-y border-black/[0.08] py-6">
          <p className="text-[15px] font-semibold tracking-tight text-ink">No schedules yet</p>
          <p className="max-w-md text-[13px] leading-relaxed text-ink-muted">
            {prereqOk
              ? 'Add dates, departure times, booking size, and price for each season or period.'
              : 'Complete Setup and Pricing first.'}
          </p>
          <button
            type="button"
            onClick={onAdd}
            className="tv-btn-primary !min-h-10"
            disabled={!canAdd}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Add schedule
          </button>
        </div>
      ) : (
        <ul
          className="divide-y divide-black/[0.07] overflow-y-auto overscroll-contain pr-0.5"
          style={{ maxHeight: SCHEDULE_LIST_SCROLL_MAX_PX }}
          aria-label="Schedules for this option"
        >
          {rows.map((s, index) => {
            const row = scheduleListRowModel(s, option, index, formatAmount);
            const pending = pendingDeleteId === s.id;
            const occupancyNotice = pending ? occupancyNoticeForSchedule?.(s) ?? null : null;

            const openEdit = () => {
              if (!pending) onEdit(s.id);
            };
            const onRowKeyDown = (e: KeyboardEvent<HTMLElement>) => {
              if (pending) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onEdit(s.id);
              }
            };

            return (
              <li key={s.id}>
                <article
                  role="button"
                  tabIndex={pending ? -1 : 0}
                  onClick={openEdit}
                  onKeyDown={onRowKeyDown}
                  aria-label={`Edit schedule ${row.name}`}
                  className="px-0.5 py-3.5 transition-colors hover:bg-black/[0.015] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                        <h4 className="truncate text-[14px] font-semibold tracking-tight text-ink">
                          {row.name}
                        </h4>
                        <span
                          className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${statusClass(row.status)}`}
                        >
                          {row.statusLabel}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                        <p className="min-w-0 text-[12.5px] leading-snug text-ink">
                          <span className="text-ink-muted">Dates </span>
                          {row.dates}
                        </p>
                        <p className="min-w-0 text-[12.5px] leading-snug text-ink">
                          <span className="text-ink-muted">Days </span>
                          {row.days}
                        </p>
                        <p className="min-w-0 text-[12.5px] leading-snug text-ink">
                          <span className="text-ink-muted">Departure </span>
                          {row.departure}
                        </p>
                        <p className="min-w-0 text-[12.5px] leading-snug text-ink">
                          <span className="text-ink-muted">{row.pricingModel} </span>
                          {row.price}
                        </p>
                        <p className="min-w-0 text-[12.5px] leading-snug text-ink sm:col-span-2">
                          <span className="text-ink-muted">Capacity </span>
                          {row.capacity}
                        </p>
                      </div>

                      {row.nextIssue ? (
                        <p className="text-[11.5px] leading-snug text-ink-muted">{row.nextIssue}</p>
                      ) : null}
                      {occupancyNotice ? (
                        <p className="text-[12px] leading-snug text-ink" role="status">
                          {occupancyNotice}
                        </p>
                      ) : null}
                    </div>

                    <div
                      className="flex shrink-0 flex-col items-stretch gap-0.5 sm:flex-row sm:items-center"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {pending ? (
                        <>
                          <button
                            type="button"
                            onClick={onCancelDelete}
                            className="lux-flat inline-flex min-h-8 items-center justify-center rounded-md px-2 text-[12px] font-medium text-ink-muted hover:bg-black/[0.04]"
                          >
                            Keep
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(s.id)}
                            className="lux-flat inline-flex min-h-8 items-center justify-center rounded-md px-2 text-[12px] font-semibold text-red-700 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => onEdit(s.id)}
                            className="lux-flat inline-flex min-h-8 items-center justify-center gap-1 rounded-md px-2 text-[12px] font-medium text-ink-muted hover:bg-black/[0.04] hover:text-ink"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDuplicate(s.id)}
                            disabled={!canAdd}
                            title={atLimit ? addGate.reason ?? undefined : undefined}
                            className="lux-flat inline-flex min-h-8 items-center justify-center gap-1 rounded-md px-2 text-[12px] font-medium text-ink-muted hover:bg-black/[0.04] hover:text-ink disabled:opacity-45"
                          >
                            <Copy className="h-3.5 w-3.5" aria-hidden />
                            Duplicate
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(s.id)}
                            className="lux-flat inline-flex min-h-8 items-center justify-center gap-1 rounded-md px-2 text-[12px] font-medium text-ink-muted hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
