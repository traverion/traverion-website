import { useEffect, useId, useRef } from 'react';
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
  formatScheduleRange,
  formatScheduleWeekdays,
  applyScheduleToOption,
  scheduleHeadlineName,
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

export function TourScheduleWorkspace({
  option,
  schedule,
  sceneIndex,
  isNewSchedule,
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
  const title = isNewSchedule ? 'New schedule' : scheduleHeadlineName(schedule, 0);

  useEffect(() => {
    headingRef.current?.focus();
  }, [sceneIndex]);

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

  const patchFromOption = (patch: Partial<ListingBookingOption>) => {
    const next: Partial<ListingOptionSchedule> = {};
    if (patch.name !== undefined) next.name = patch.name;
    if (patch.availabilityDateFrom !== undefined) next.availabilityDateFrom = patch.availabilityDateFrom;
    if (patch.availabilityDateTo !== undefined) next.availabilityDateTo = patch.availabilityDateTo;
    if (patch.weekdays !== undefined) next.weekdays = patch.weekdays;
    if (patch.startTime !== undefined) next.startTime = patch.startTime;
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

  return (
    <div className="listing-creation-schedule-layer" role="presentation">
      <button
        type="button"
        className="listing-creation-schedule-backdrop"
        aria-label="Close schedule"
        onClick={onCancel}
      />
      <div
        ref={dialogRef}
        className="listing-creation-schedule-workspace listing-creation-schedule-workspace--enter"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="listing-creation-schedule-header">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <button type="button" onClick={onBack} className="lux-flat inline-flex min-h-11 items-center text-sm font-medium text-ink-muted hover:text-ink">
                ← Back
              </button>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                {option.name.trim() || 'Option'} · Availability &amp; Pricing
              </p>
              <h3
                ref={headingRef}
                id={titleId}
                tabIndex={-1}
                className="mt-1 font-display text-[1.85rem] font-bold leading-tight tracking-tight text-ink outline-none sm:text-[2.1rem]"
              >
                {title}
              </h3>
            </div>
            <p
              className={`pt-2 text-xs tabular-nums ${
                persistLabel === 'Save failed' ? 'font-medium text-red-700' : 'text-ink-muted'
              }`}
              aria-live="polite"
            >
              {persistLabel ?? ''}
            </p>
          </div>
          <nav aria-label="Schedule steps" className="mt-4">
            <ol className="flex flex-wrap gap-1">
              {navItems.map((item, index) => (
                <li key={item.id}>
                  <ListingCreationNavButton
                    item={{ ...item, label: `${index + 1} ${item.label}` }}
                    onClick={() => {
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
                    }}
                  />
                </li>
              ))}
            </ol>
          </nav>
        </header>
        <div className="listing-creation-schedule-body">
          {saveError ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3" role="alert">
              <p className="text-sm font-semibold text-ink">Couldn’t save this schedule. Your changes are still here.</p>
              <p className="mt-1 text-sm text-ink-muted">{saveError}</p>
            </div>
          ) : null}
          {scene.id === 'review' ? (
            <ScheduleReview
              schedule={schedule}
              option={option}
              formatAmount={formatAmount}
              onEdit={(id) => onSelectScene(TOUR_SCHEDULE_SCENES.findIndex((s) => s.id === id))}
            />
          ) : (
            <div className="w-full max-w-2xl">
              {scene.id === 'when' ? (
                <div className="mb-5">
                  <label htmlFor="supplier-schedule-name" className="mb-1 block text-sm font-semibold text-ink">
                    Schedule name
                  </label>
                  <input
                    id="supplier-schedule-name"
                    type="text"
                    value={schedule.name}
                    onChange={(e) => onChange({ name: e.target.value })}
                    className="tv-input w-full"
                    placeholder="September pricing"
                  />
                  <p className="mt-1 text-xs text-ink-muted">
                    Optional. You can add multiple schedules on this option (e.g. different seasons or times).
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
        <footer className="listing-creation-schedule-footer">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={onCancel} className="tv-btn-ghost !min-h-11 w-full sm:w-auto">
              Cancel
            </button>
            <div className="flex min-w-0 flex-col items-stretch gap-2 sm:items-end">
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button type="button" onClick={onSaveDraft} className="tv-btn-secondary !min-h-11 w-full sm:w-auto">
                  Save draft
                </button>
                {lastScene ? (
                  <button type="button" onClick={onSaveReady} className="tv-btn-primary !min-h-11 w-full sm:w-auto">
                    Save schedule
                  </button>
                ) : (
                  <button type="button" onClick={onContinue} className="tv-btn-primary !min-h-11 w-full sm:w-auto">
                    Continue
                  </button>
                )}
              </div>
              {continueHint ? (
                <p className="listing-creation-hint text-xs text-ink-muted sm:text-right" role="status">
                  {continueHint}
                </p>
              ) : null}
              {!isTourScheduleSceneSatisfied(sceneIndex, schedule, option) && attempted && !continueHint ? (
                <p className="listing-creation-hint text-xs text-ink-muted sm:text-right" role="status">
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
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
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
    (option.startMode === 'flexible' || Boolean(schedule.startTime.trim()));
  const rows: Array<{ id: TourScheduleSceneId; title: string; body: string; ok: boolean }> = [
    {
      id: 'when',
      title: 'When',
      ok: whenOk,
      body: [
        formatScheduleRange(schedule.availabilityDateFrom, schedule.availabilityDateTo),
        formatScheduleWeekdays(schedule.weekdays),
        schedule.startTime.trim() || (option.startMode === 'flexible' ? 'Flexible hours' : ''),
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
      <p className="text-sm text-ink-muted">
        {complete ? 'This schedule is complete and can be saved as ready.' : 'Finish the gaps below before this schedule can be ready.'}
      </p>
      {rows.map((row) => (
        <div key={row.id} className="lc-section rounded-xl px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{row.title}</p>
              <p className="mt-2 text-sm text-ink">{row.body}</p>
            </div>
            <button type="button" onClick={() => onEdit(row.id)} className="tv-btn-ghost !min-h-10 shrink-0 px-3 text-xs">
              Edit
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
