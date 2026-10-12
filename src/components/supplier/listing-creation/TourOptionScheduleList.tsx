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
import { optionChargeModel } from '../../../lib/listing-option-charge-model';

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
  const chargeLabel = charge === 'flat_group' ? 'Per group' : charge === 'per_person' ? 'Per person' : null;

  return (
    <div id="supplier-listing-field-option-schedules" className="space-y-3">
      <p className="partner-section-desc max-w-xl">
        Date window
        {option.startMode === 'flexible' ? '' : ', departure times'}
        , capacity, and price per schedule. Separate seasons need separate schedules.
      </p>
      {!canAdd ? (
        <div className="rounded-[var(--partner-radius,0.5rem)] border border-amber-200/80 bg-amber-50/70 px-3.5 py-3 text-[13px] text-amber-950">
          <p className="font-semibold text-amber-900">Finish Setup before adding schedules</p>
          <p className="mt-1 leading-snug text-amber-900/90">
            Charge model and start-time mode decide which price and time fields appear.
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            {prereq.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <div className="partner-empty items-center text-center sm:px-6">
          <p className="partner-empty__title">No schedules yet</p>
          <p className="partner-empty__body mx-auto text-center">
            {canAdd
              ? 'Add dates, start time, capacity, and price.'
              : 'Complete Setup to unlock Add schedule.'}
          </p>
          <div className="partner-empty__actions justify-center">
            <button
              type="button"
              onClick={onAdd}
              className="tv-btn-primary"
              disabled={!canAdd}
              title={canAdd ? undefined : 'Complete Setup before adding a schedule'}
            >
              {canAdd ? 'Add schedule' : 'Setup incomplete'}
            </button>
          </div>
        </div>
      ) : (
        rows.map((s, index) => {
          const status = scheduleStatus(s, option.startMode);
          const pending = pendingDeleteId === s.id;
          const occupancyNotice = pending ? occupancyNoticeForSchedule?.(s) ?? null : null;
          return (
            <article key={s.id} className="lc-tile rounded-[var(--partner-radius,0.5rem)] px-3 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[13px] font-semibold tracking-tight text-ink">{scheduleHeadlineName(s, index)}</h3>
                    {status === 'ready' ? (
                      <span className="inline-flex items-center gap-1 partner-label text-finland">
                        <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                        Ready
                      </span>
                    ) : (
                      <span className="partner-label">Draft</span>
                    )}
                  </div>
                  <p className="text-[13px] font-medium text-ink">
                    {formatScheduleRange(s.availabilityDateFrom, s.availabilityDateTo) || 'Dates not set'}
                  </p>
                  <p className="partner-meta">
                    {[
                      formatScheduleWeekdays(s.weekdays),
                      s.startTime.trim() || (option.startMode === 'flexible' ? 'Flexible hours' : null),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p className="text-[13px] font-semibold tabular-nums text-ink">
                    {[chargeLabel, summarizeOptionPricing(s, formatAmount)].filter(Boolean).join(' · ')}
                  </p>
                  <p className="partner-meta">
                    {charge === 'flat_group'
                      ? `${s.maxSpotsPerSlot} group${s.maxSpotsPerSlot === 1 ? '' : 's'} · up to ${s.maxPersons} per group`
                      : `Book ${s.minPersons}–${s.maxPersons} · ${s.maxSpotsPerSlot} seats / departure`}
                  </p>
                  {occupancyNotice ? (
                    <p className="mt-1.5 text-[13px] leading-snug text-ink" role="status">
                      {occupancyNotice}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {pending ? (
                    <>
                      <button type="button" onClick={onCancelDelete} className="tv-btn-ghost">
                        Keep
                      </button>
                      <button type="button" onClick={() => onDelete(s.id)} className="partner-btn-danger lux-flat">
                        Delete schedule
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => onEdit(s.id)} className="tv-btn-secondary inline-flex items-center gap-1">
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDuplicate(s.id)}
                        disabled={!canAdd}
                        title={canAdd ? undefined : 'Finish Setup first (how you charge and start time style).'}
                        className="tv-btn-ghost inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(s.id)}
                        className="partner-btn-danger lux-flat inline-flex items-center gap-1"
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
          disabled={!canAdd}
          className="lc-upload inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[var(--partner-radius,0.5rem)] px-3 py-2.5 text-[13px] font-semibold text-finland disabled:opacity-50"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          {canAdd ? 'Add schedule' : 'Finish Setup to unlock'}
        </button>
      ) : null}
    </div>
  );
}
