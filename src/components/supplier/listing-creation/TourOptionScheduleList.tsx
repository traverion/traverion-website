import { Check, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ListingBookingOption, ListingOptionSchedule } from '../../../types/listingExtras';
import {
  formatScheduleRange,
  formatScheduleWeekdays,
  listingOptionHasSchedules,
  listingOptionSchedules,
  scheduleHeadlineName,
  scheduleIsBookable,
  scheduleWizardIsComplete,
} from '../../../lib/listing-option-schedules';
import { summarizeOptionPricing } from '../../../lib/price-categories';

function scheduleStatus(s: ListingOptionSchedule): 'ready' | 'draft' {
  if (s.status === 'draft') return 'draft';
  if (scheduleWizardIsComplete(s) && scheduleIsBookable(s)) return 'ready';
  return 'draft';
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
}: {
  option: ListingBookingOption;
  formatAmount: (n: number) => string;
  onAdd: () => void;
  onEdit: (scheduleId: string) => void;
  onDuplicate: (scheduleId: string) => void;
  onDelete: (scheduleId: string) => void;
  pendingDeleteId: string | null;
  onCancelDelete: () => void;
}) {
  const rows = listingOptionHasSchedules(option) ? option.schedules ?? [] : listingOptionSchedules(option);

  return (
    <div id="supplier-listing-field-option-schedules" className="space-y-3">
      <p className="text-sm leading-relaxed text-ink-muted">
        Each schedule is a date window with its own days, start time, capacity, and price. Add as many as you need —
        for example one for September and another for October.
      </p>
      {rows.length === 0 ? (
        <div className="lc-section rounded-xl px-4 py-6 text-center sm:px-5">
          <p className="font-display text-lg font-bold text-ink">No schedules yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            Add your first schedule so travelers can pick a date and see the right price.
          </p>
          <button type="button" onClick={onAdd} className="tv-btn-primary mt-4 !min-h-11">
            Add schedule
          </button>
        </div>
      ) : (
        rows.map((s, index) => {
          const status = scheduleStatus(s);
          const pending = pendingDeleteId === s.id;
          return (
            <article key={s.id} className="lc-tile rounded-xl px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-ink">{scheduleHeadlineName(s, index)}</h3>
                    {status === 'ready' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-finland">
                        <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                        Ready
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                        Draft
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ink">
                    {formatScheduleRange(s.availabilityDateFrom, s.availabilityDateTo) || 'Dates not set'}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {[formatScheduleWeekdays(s.weekdays), s.startTime.trim() || null].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-sm text-ink">{summarizeOptionPricing(s, formatAmount)}</p>
                  <p className="text-xs text-ink-muted">Max {s.maxSpotsPerSlot} travelers</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {pending ? (
                    <>
                      <button type="button" onClick={onCancelDelete} className="tv-btn-ghost">
                        Keep
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(s.id)}
                        className="lc-btn-danger inline-flex min-h-[44px] items-center rounded-lg px-3 py-2 text-xs font-medium"
                      >
                        Delete schedule
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => onEdit(s.id)} className="tv-btn-secondary !min-h-11">
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        Edit
                      </button>
                      <button type="button" onClick={() => onDuplicate(s.id)} className="tv-btn-ghost !min-h-11">
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(s.id)}
                        className="lc-btn-danger inline-flex min-h-[44px] items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })
      )}
      {rows.length > 0 ? (
        <button
          type="button"
          onClick={onAdd}
          className="lc-upload inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl px-4 py-4 text-sm font-semibold text-finland"
        >
          <Plus className="h-5 w-5 shrink-0" aria-hidden />
          Add schedule
        </button>
      ) : null}
    </div>
  );
}
