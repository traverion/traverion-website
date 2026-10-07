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
import { bookingOptionSchedulePrereqIssues } from '../../../lib/listing-option-validation';

function scheduleStatus(
  s: ListingOptionSchedule,
  startMode: ListingBookingOption['startMode']
): 'ready' | 'draft' {
  if (s.status === 'draft') return 'draft';
  const mode = { startMode };
  if (scheduleWizardIsComplete(s, mode) && scheduleIsBookable(s, mode)) return 'ready';
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
  const canAdd = prereq.length === 0;

  return (
    <div id="supplier-listing-field-option-schedules" className="space-y-5">
      <p className="max-w-xl text-sm leading-relaxed text-ink-muted">
        Each schedule is a date window with its own operating days
        {option.startMode === 'flexible' ? '' : ', start time'}
        , capacity, and price. Add as many as you need — for example one for September and another for October.
      </p>
      {!canAdd ? (
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-5 py-4 text-sm text-amber-950">
          <p className="font-semibold text-amber-900">Schedules are locked until Setup is finished</p>
          <p className="mt-2 leading-relaxed">
            Each schedule asks for a price and a start time, and the right fields depend on two Setup choices: how
            you charge and whether departures have a fixed start time.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {prereq.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <div className="lc-section rounded-2xl px-5 py-8 text-center sm:px-8">
          <p className="font-display text-xl font-bold text-ink">No schedules yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
            Add your first schedule so travelers can pick a date and see the right price.
          </p>
          <button
            type="button"
            onClick={onAdd}
            className="tv-btn-primary mt-5 !min-h-11"
          >
            {canAdd ? 'Add schedule' : 'Go to Setup first'}
          </button>
        </div>
      ) : (
        rows.map((s, index) => {
          const status = scheduleStatus(s, option.startMode);
          const pending = pendingDeleteId === s.id;
          const occupancyNotice = pending ? occupancyNoticeForSchedule?.(s) ?? null : null;
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
                    {[
                      formatScheduleWeekdays(s.weekdays),
                      s.startTime.trim() || (option.startMode === 'flexible' ? 'Flexible hours' : null),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p className="text-sm text-ink">{summarizeOptionPricing(s, formatAmount)}</p>
                  <p className="text-xs text-ink-muted">Max {s.maxSpotsPerSlot} travelers</p>
                  {occupancyNotice ? (
                    <p className="mt-2 text-sm leading-relaxed text-ink" role="status">
                      {occupancyNotice}
                    </p>
                  ) : null}
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
                      <button
                        type="button"
                        onClick={() => onDuplicate(s.id)}
                        disabled={!canAdd}
                        title={canAdd ? undefined : 'Finish Setup first (how you charge and start time style).'}
                        className="tv-btn-ghost !min-h-11 disabled:opacity-50"
                      >
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
          {canAdd ? 'Add schedule' : 'Go to Setup to unlock schedules'}
        </button>
      ) : null}
    </div>
  );
}
