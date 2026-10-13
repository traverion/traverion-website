import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ListingBookingOption, ListingOptionSchedule } from '../../../types/listingExtras';
import {
  formatScheduleDepartureSummary,
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
import { optionChargeModel } from '../../../lib/listing-option-charge-model';

/** Soft viewport before the schedule list scrolls internally (≈5 compact rows). */
const SCHEDULE_LIST_SCROLL_MAX_PX = 280;

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
  const charge = optionChargeModel(option);
  const chargeLabel = charge === 'flat_group' ? 'Whole group' : charge === 'per_person' ? 'Per person' : null;
  const countLabel =
    rows.length === 0
      ? 'No schedules'
      : rows.length === 1
        ? '1 schedule'
        : `${rows.length} schedules`;

  return (
    <div id="supplier-listing-field-option-schedules" className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-ink">{countLabel}</p>
        {rows.length > 0 ? (
          <button
            type="button"
            onClick={onAdd}
            disabled={!canAdd}
            className="lux-flat inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[12.5px] font-semibold text-finland hover:bg-finland/[0.06] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland/30"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add schedule
          </button>
        ) : null}
      </div>

      {!canAdd ? (
        <div className="rounded-lg border border-amber-200/70 bg-amber-50/50 px-3 py-2 text-[12px] text-amber-950">
          <p className="font-medium">Finish Setup and Pricing to add schedules</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {prereq.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-black/[0.12] px-4 py-4">
          <p className="text-[13px] font-semibold text-ink">No schedules yet</p>
          <p className="max-w-md text-[12px] leading-snug text-ink-muted">
            {canAdd
              ? 'Add dates, departure time, capacity, and price.'
              : 'Complete Setup and Pricing first.'}
          </p>
          <button
            type="button"
            onClick={onAdd}
            className="tv-btn-primary !min-h-9"
            disabled={!canAdd}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Add schedule
          </button>
        </div>
      ) : (
        <div
          className="space-y-2 overflow-y-auto overscroll-contain pr-0.5"
          style={rows.length > 5 ? { maxHeight: SCHEDULE_LIST_SCROLL_MAX_PX } : undefined}
        >
          {rows.map((s, index) => {
            const status = scheduleStatus(s, option.startMode);
            const pending = pendingDeleteId === s.id;
            const occupancyNotice = pending ? occupancyNoticeForSchedule?.(s) ?? null : null;
            return (
              <article
                key={s.id}
                className="rounded-lg border border-black/[0.08] bg-white px-3 py-2.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <h3 className="text-[13px] font-semibold tracking-tight text-ink">
                        {scheduleHeadlineName(s, index)}
                      </h3>
                      <span className="text-[11.5px] text-ink-muted">
                        {status === 'ready' ? 'Ready' : 'Draft'}
                      </span>
                    </div>
                    <p className="text-[12.5px] text-ink">
                      {formatScheduleRange(s.availabilityDateFrom, s.availabilityDateTo) ||
                        'Dates not set'}
                    </p>
                    <p className="text-[12px] text-ink-muted">
                      {[
                        formatScheduleWeekdays(s.weekdays),
                        formatScheduleDepartureSummary(s, option.startMode) || null,
                        chargeLabel,
                        summarizeOptionPricing(s, formatAmount),
                        charge === 'flat_group'
                          ? `${s.maxSpotsPerSlot} group${s.maxSpotsPerSlot === 1 ? '' : 's'} · up to ${s.maxPersons}`
                          : `${s.minPersons}–${s.maxPersons} · ${s.maxSpotsPerSlot} seats`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {occupancyNotice ? (
                      <p className="mt-1 text-[12px] leading-snug text-ink" role="status">
                        {occupancyNotice}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-0.5 shrink-0">
                    {pending ? (
                      <>
                        <button
                          type="button"
                          onClick={onCancelDelete}
                          className="lux-flat inline-flex min-h-8 items-center rounded-md px-2 text-[12.5px] font-medium text-ink-muted hover:bg-black/[0.04]"
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(s.id)}
                          className="lux-flat inline-flex min-h-8 items-center rounded-md px-2 text-[12.5px] font-semibold text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onEdit(s.id)}
                          className="lux-flat inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[12.5px] font-medium text-ink-muted hover:bg-black/[0.04] hover:text-ink"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicate(s.id)}
                          disabled={!canAdd}
                          className="lux-flat inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[12.5px] font-medium text-ink-muted hover:bg-black/[0.04] hover:text-ink disabled:opacity-50"
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(s.id)}
                          className="lux-flat inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[12.5px] font-medium text-ink-muted hover:bg-red-50 hover:text-red-700"
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
          })}
        </div>
      )}
    </div>
  );
}
