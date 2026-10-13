import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ListingBookingOption, ListingOptionSchedule } from '../../../types/listingExtras';
import BookingOptionEditor from '../BookingOptionEditor';
import {
  TOUR_SCHEDULE_SCENE_COUNT,
  TOUR_SCHEDULE_SCENES,
  canVisitTourScheduleScene,
  firstScheduleIssueFocusId,
  isTourScheduleSceneSatisfied,
  tourScheduleContextNavItems,
  tourScheduleLockedReason,
  tourScheduleSceneContinueHint,
  type TourScheduleSceneId,
} from '../../../lib/listing-schedule-wizard';
import {
  formatScheduleDepartureSummary,
  formatScheduleRange,
  formatScheduleWeekdays,
  applyScheduleToOption,
  scheduleHasFixedDepartures,
  scheduleWizardIsComplete,
} from '../../../lib/listing-option-schedules';
import { summarizeOptionPricing } from '../../../lib/price-categories';
import { ListingCreationNavButton } from './ListingCreationNavButton';

function focusField(fieldId: string | null) {
  if (!fieldId || typeof document === 'undefined') return;
  requestAnimationFrame(() => {
    const root = document.getElementById(fieldId);
    if (!root) return;
    root.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const target = root.matches('input, textarea, select, button')
      ? root
      : root.querySelector<HTMLElement>('input, textarea, select, button');
    target?.focus();
  });
}

/**
 * Full-screen schedule editor matching TourOptionWorkspace:
 * left step rail → main header (option + schedule name) → fields → sticky footer.
 */
export function TourScheduleWorkspace({
  option,
  schedule,
  sceneIndex,
  isNewSchedule,
  listingTitle: _listingTitle,
  leaveOpen,
  onKeepEditing,
  onLeave,
  persistLabel,
  currencyLabel,
  formatAmount,
  hasEndingDate,
  saveError,
  attempted,
  continueHint,
  onHasEndingDateChange,
  onChange,
  onSelectScene,
  onBack,
  onCancel,
  onSaveDraft,
  onContinue,
  onSaveReady,
}: {
  option: ListingBookingOption;
  schedule: ListingOptionSchedule;
  sceneIndex: number;
  isNewSchedule: boolean;
  listingTitle: string;
  leaveOpen: boolean;
  onKeepEditing: () => void;
  onLeave: () => void;
  persistLabel: string | null;
  currencyLabel: string;
  formatAmount: (n: number) => string;
  hasEndingDate: boolean;
  saveError: string | null;
  attempted: boolean;
  continueHint: string | null;
  onHasEndingDateChange: (on: boolean) => void;
  onChange: (patch: Partial<ListingOptionSchedule>) => void;
  onSelectScene: (index: number) => void;
  onBack: () => void;
  onCancel: () => void;
  onSaveDraft: () => void;
  onContinue: () => void;
  onSaveReady: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const hintId = useId();
  const scene = TOUR_SCHEDULE_SCENES[sceneIndex] ?? TOUR_SCHEDULE_SCENES[0];
  const navItems = tourScheduleContextNavItems(sceneIndex, { isNewSchedule, schedule, option });
  const optionView = applyScheduleToOption(
    {
      ...option,
      name: schedule.name,
    },
    schedule
  );
  const lastScene = sceneIndex >= TOUR_SCHEDULE_SCENE_COUNT - 1;
  const railTitle = isNewSchedule ? 'New schedule' : 'Edit schedule';
  const optionLabel = option.name.trim() || 'Untitled option';

  useEffect(() => {
    headingRef.current?.focus();
  }, [sceneIndex]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    const previously = document.activeElement as HTMLElement | null;
    const focusables = () =>
      [...node.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )].filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener('keydown', onKey);
    return () => {
      node.removeEventListener('keydown', onKey);
      previously?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (dialogRef.current?.querySelector('[role="listbox"]')) return;
      const target = e.target as HTMLElement | null;
      // Don't treat Esc in fields as leave — native time inputs also clear on Esc.
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      if (leaveOpen) onKeepEditing();
      else onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [leaveOpen, onCancel, onKeepEditing]);

  const patchFromOption = (patch: Partial<ListingBookingOption>) => {
    const next: Partial<ListingOptionSchedule> = {};
    if (patch.name !== undefined) next.name = patch.name;
    if (patch.availabilityDateFrom !== undefined) next.availabilityDateFrom = patch.availabilityDateFrom;
    if (patch.availabilityDateTo !== undefined) next.availabilityDateTo = patch.availabilityDateTo;
    if (patch.weekdays !== undefined) next.weekdays = patch.weekdays;
    if (patch.startTime !== undefined) next.startTime = patch.startTime;
    if (patch.weekdayStartTimes !== undefined) next.weekdayStartTimes = patch.weekdayStartTimes;
    if (patch.pricingMode !== undefined) next.pricingMode = patch.pricingMode;
    if (patch.priceUsd !== undefined) next.priceUsd = patch.priceUsd;
    if (patch.priceCategories !== undefined) next.priceCategories = patch.priceCategories;
    if (patch.isPrivate !== undefined) next.isPrivate = patch.isPrivate;
    if (patch.privatePricing !== undefined) next.privatePricing = patch.privatePricing;
    if (patch.privateGroupPriceUsd !== undefined) next.privateGroupPriceUsd = patch.privateGroupPriceUsd;
    if (patch.minPersons !== undefined) next.minPersons = patch.minPersons;
    if (patch.maxPersons !== undefined) next.maxPersons = patch.maxPersons;
    if (patch.maxSpotsPerSlot !== undefined) next.maxSpotsPerSlot = patch.maxSpotsPerSlot;
    onChange(next);
  };

  const selectScene = (index: number) => {
    if (
      !canVisitTourScheduleScene({
        targetIndex: index,
        isNewSchedule,
        schedule,
        option,
      })
    ) {
      focusField(firstScheduleIssueFocusId(schedule, { startMode: option.startMode }));
      return;
    }
    onSelectScene(index);
  };

  const layer = (
    <div className="listing-creation-schedule-layer" role="presentation">
      <div
        ref={dialogRef}
        className="listing-creation-schedule-workspace listing-creation-schedule-workspace--enter"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <aside className="listing-creation-schedule-rail hidden h-full min-h-0 w-[15rem] shrink-0 flex-col overflow-hidden border-r border-black/[0.08] bg-[#f7f4ef] lg:flex xl:w-[15.5rem]">
          <div className="px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={onCancel}
              className="lux-flat inline-flex min-h-9 items-center text-[13px] font-medium text-ink-muted hover:text-ink"
            >
              ← Back to option
            </button>
            <p className="mt-5 text-[1.05rem] font-semibold leading-snug tracking-tight text-ink">
              {railTitle}
            </p>
            <div className="mt-2 min-h-4">
              {persistLabel ? (
                <p
                  className={`text-[11px] tabular-nums ${
                    persistLabel === 'Save failed' || persistLabel === 'Unsaved changes'
                      ? 'font-medium text-ink-muted'
                      : 'text-ink-muted'
                  }`}
                  aria-live="polite"
                >
                  {persistLabel}
                </p>
              ) : null}
            </div>
          </div>
          <nav aria-label="Schedule steps" className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
            <ol className="space-y-0.5">
              {navItems.map((item, index) => (
                <li key={item.id}>
                  <ListingCreationNavButton
                    item={item}
                    step={index + 1}
                    onClick={() => selectScene(index)}
                  />
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="listing-creation-schedule-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#fffcf8]">
          <header className="listing-creation-schedule-header shrink-0 border-b border-black/[0.07] px-4 pb-4 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-[56rem] flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={onCancel}
                  className="lux-flat mb-1.5 inline-flex min-h-8 items-center gap-1 text-[12.5px] font-semibold text-finland hover:underline lg:hidden"
                >
                  <span aria-hidden>←</span> Back to option
                </button>
                <h2
                  ref={headingRef}
                  id={titleId}
                  tabIndex={-1}
                  className="truncate text-[1.25rem] font-semibold leading-snug tracking-tight text-ink outline-none sm:text-[1.35rem]"
                  title={optionLabel}
                >
                  {optionLabel}
                </h2>
              </div>
              <p
                className={`shrink-0 pt-0.5 text-[11px] tabular-nums lg:hidden ${
                  persistLabel === 'Save failed' ? 'font-medium text-red-700' : 'text-ink-muted'
                }`}
                aria-live="polite"
              >
                {persistLabel ?? ''}
              </p>
            </div>
          </header>

          <div className="listing-creation-schedule-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
            <div className="mx-auto w-full max-w-[56rem]">
              {saveError ? (
                <p className="mb-3 text-[12px] leading-snug text-red-800" role="alert">
                  Couldn’t save — {saveError}
                </p>
              ) : null}

              <h3 className="mb-4 text-[1.125rem] font-semibold leading-snug tracking-tight text-ink sm:text-[1.2rem]">
                {scene.question}
              </h3>

              {scene.id === 'review' ? (
                <ScheduleReview
                  schedule={schedule}
                  option={option}
                  formatAmount={formatAmount}
                  onEdit={(id) => onSelectScene(TOUR_SCHEDULE_SCENES.findIndex((s) => s.id === id))}
                />
              ) : (
                <div className="w-full space-y-4">
                  {scene.id === 'when' ? (
                    <div className="max-w-md">
                      <label
                        htmlFor="supplier-schedule-name"
                        className="mb-1 block text-[13px] font-semibold text-ink"
                      >
                        Schedule name
                      </label>
                      <input
                        id="supplier-schedule-name"
                        type="text"
                        value={schedule.name}
                        onChange={(e) => onChange({ name: e.target.value })}
                        className="tv-input w-full font-medium"
                        placeholder="e.g. Winter evenings"
                      />
                      <p className="mt-1.5 text-[12px] leading-snug text-ink-muted">
                        Shown to customers when they book.
                      </p>
                    </div>
                  ) : null}
                  <div
                    id={
                      scene.id === 'when'
                        ? 'supplier-schedule-field-from'
                        : 'supplier-schedule-field-price'
                    }
                  >
                    <BookingOptionEditor
                      option={optionView}
                      currencyLabel={currencyLabel}
                      hasEndingDate={hasEndingDate}
                      onHasEndingDateChange={onHasEndingDateChange}
                      onChange={patchFromOption}
                      activeSection={scene.id === 'when' ? 'availability' : 'price_capacity'}
                      attempted={attempted}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="listing-creation-schedule-footer shrink-0 border-t border-black/[0.07] px-4 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-[56rem] flex-col gap-1.5">
              {continueHint ? (
                <p id={hintId} className="text-[12px] leading-snug text-ink-muted" role="status">
                  {continueHint}
                </p>
              ) : !isTourScheduleSceneSatisfied(sceneIndex, schedule, option) && attempted ? (
                <p className="text-[12px] leading-snug text-ink-muted" role="status">
                  {tourScheduleLockedReason({
                    targetIndex: sceneIndex + 1,
                    schedule,
                    option,
                  }) ||
                    tourScheduleSceneContinueHint({
                      sceneIndex,
                      schedule,
                      option,
                      canContinue: false,
                    })}
                </p>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div>
                  {sceneIndex > 0 ? (
                    <button
                      type="button"
                      onClick={onBack}
                      className="touch-manipulation tv-btn-ghost !min-h-10 w-full sm:w-auto"
                    >
                      Back
                    </button>
                  ) : (
                    <span className="hidden sm:block sm:min-w-[4.5rem]" aria-hidden />
                  )}
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-2.5">
                  <button
                    type="button"
                    onClick={onSaveDraft}
                    className="touch-manipulation tv-btn-secondary !min-h-10 w-full sm:w-auto"
                  >
                    Save draft
                  </button>
                  {lastScene ? (
                    <button
                      type="button"
                      onClick={onSaveReady}
                      className="touch-manipulation tv-btn-primary !min-h-10 w-full sm:w-auto"
                    >
                      Finish schedule
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onContinue}
                      aria-describedby={continueHint ? hintId : undefined}
                      className="touch-manipulation tv-btn-primary !min-h-10 w-full sm:w-auto"
                    >
                      Continue
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {leaveOpen ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div
              className="w-full max-w-sm rounded-xl border border-black/[0.08] bg-white px-5 py-5 shadow-lg"
              role="alertdialog"
              aria-labelledby="schedule-leave-title"
            >
              <p id="schedule-leave-title" className="text-[15px] font-semibold text-ink">
                Leave without saving changes?
              </p>
              <p className="mt-2 text-[13px] text-ink-muted">
                This schedule still has edits that have not been saved.
              </p>
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" className="tv-btn-ghost !min-h-10" onClick={onKeepEditing}>
                  Keep editing
                </button>
                <button type="button" className="tv-btn-primary !min-h-10" onClick={onLeave}>
                  Leave
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return layer;
  return createPortal(layer, document.body);
}

function ScheduleReview({
  schedule,
  option,
  formatAmount,
  onEdit,
}: {
  schedule: ListingOptionSchedule;
  option: ListingBookingOption;
  formatAmount: (n: number) => string;
  onEdit: (id: TourScheduleSceneId) => void;
}) {
  const complete = scheduleWizardIsComplete(schedule, { startMode: option.startMode });
  const whenOk =
    Boolean(schedule.availabilityDateFrom.trim() && schedule.weekdays.some(Boolean)) &&
    scheduleHasFixedDepartures(schedule, option.startMode);
  const rows: Array<{ id: TourScheduleSceneId; title: string; body: string; ok: boolean }> = [
    {
      id: 'when',
      title: 'When',
      ok: whenOk,
      body: [
        schedule.name.trim() || null,
        formatScheduleRange(schedule.availabilityDateFrom, schedule.availabilityDateTo),
        formatScheduleWeekdays(schedule.weekdays),
        formatScheduleDepartureSummary(schedule, option.startMode),
      ]
        .filter(Boolean)
        .join(' · ') || 'Not configured',
    },
    {
      id: 'price_capacity',
      title: 'Price & capacity',
      ok:
        summarizeOptionPricing(schedule, formatAmount) !== 'Set price' && schedule.maxSpotsPerSlot >= 1,
      body: [
        summarizeOptionPricing(schedule, formatAmount),
        `Max ${schedule.maxSpotsPerSlot} travelers`,
      ].join(' · '),
    },
  ];

  return (
    <div className="w-full max-w-xl space-y-3">
      <p className="text-[13px] text-ink-muted">
        {complete
          ? 'Ready to finish — this schedule can be saved.'
          : 'Finish the gaps below before this schedule can be ready.'}
      </p>
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex items-start justify-between gap-3 border-b border-black/[0.06] py-3 last:border-b-0"
        >
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink">{row.title}</p>
            <p className={`mt-0.5 text-[12.5px] leading-snug ${row.ok ? 'text-ink' : 'text-ink-muted'}`}>
              {row.body}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onEdit(row.id)}
            className="lux-flat shrink-0 rounded-md px-2 py-1 text-[12.5px] font-medium text-finland hover:bg-finland/[0.06]"
          >
            Edit
          </button>
        </div>
      ))}
    </div>
  );
}
