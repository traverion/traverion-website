import { useEffect, useId, useRef, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import type { ListingBookingOption, ListingOptionSchedule } from '../../../types/listingExtras';
import BookingOptionEditor from '../BookingOptionEditor';
import {
  TOUR_SCHEDULE_SCENE_COUNT,
  TOUR_SCHEDULE_SCENES,
  canVisitTourScheduleScene,
  firstScheduleIssueFocusId,
  isTourScheduleSceneSatisfied,
  scheduleCapacityCeilings,
  scheduleCapacitySceneIssues,
  schedulePeriodIssues,
  schedulePriceCapacityIssues,
  schedulePricingSceneIssues,
  scheduleReadyOverlapIssue,
  tourScheduleContextNavItems,
  tourScheduleLockedReason,
  tourScheduleSceneContinueHint,
  type TourScheduleSceneId,
} from '../../../lib/listing-schedule-wizard';
import {
  formatScheduleDepartureSummary,
  formatScheduleWeekdays,
  applyScheduleToOption,
} from '../../../lib/listing-option-schedules';
import {
  formatScheduleListDates,
  formatScheduleListDeparture,
  formatScheduleListPrice,
} from '../../../lib/listing-schedule-list';
import {
  formatSupplierEarningsPreview,
  previewSupplierEarningsFromGross,
  SUPPLIER_PRICING_PREVIEW_COMMISSION_BPS,
} from '../../../lib/supplier-pricing-preview';
import { formatBpsAsPercent } from '../../../lib/commercial-money';
import { activePriceCategories, optionPricingMode } from '../../../lib/price-categories';
import { optionChargeModel } from '../../../lib/listing-option-charge-model';
import { ListingCreationNavButton } from './ListingCreationNavButton';
import { ListingCreationMobileStepStrip } from './ListingCreationMobileStepStrip';

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
  const sceneHeadingRef = useRef<HTMLHeadingElement>(null);
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
  const { guestsCeiling, spotsCeiling } = scheduleCapacityCeilings(option);
  const lastScene = sceneIndex >= TOUR_SCHEDULE_SCENE_COUNT - 1;
  const railTitle = isNewSchedule ? 'New schedule' : 'Edit schedule';
  const optionLabel = option.name.trim() || 'Untitled option';
  const groupPricing =
    option.chargeModel === 'flat_group' ||
    Boolean(option.isPrivate && option.privatePricing === 'flat_group');
  const sceneQuestion =
    scene.id === 'capacity' && groupPricing
      ? 'Seats and group size'
      : scene.id === 'pricing' && groupPricing
        ? 'Whole-group price'
        : scene.question;

  useEffect(() => {
    // Focus the scene question — not the option name — to avoid a blue focus ring on the header.
    sceneHeadingRef.current?.focus({ preventScroll: true });
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

  // Keep schedule inventory aligned with option slot capacity (set on Pricing).
  useEffect(() => {
    if (option.maxSpotsPerSlot >= 1 && schedule.maxSpotsPerSlot !== option.maxSpotsPerSlot) {
      onChange({ maxSpotsPerSlot: option.maxSpotsPerSlot });
    }
  }, [option.maxSpotsPerSlot, schedule.maxSpotsPerSlot, onChange]);

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
    if (patch.maxGroupsPerSlot !== undefined) next.maxGroupsPerSlot = patch.maxGroupsPerSlot;
    // Schedules inherit option travelers-per-slot; ignore edits that would diverge.
    if (option.maxSpotsPerSlot >= 1) {
      next.maxSpotsPerSlot = option.maxSpotsPerSlot;
    } else if (patch.maxSpotsPerSlot !== undefined) {
      next.maxSpotsPerSlot = patch.maxSpotsPerSlot;
    }
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
      focusField(firstScheduleIssueFocusId(schedule, { startMode: option.startMode, option }));
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
        <aside className="listing-creation-schedule-rail hidden h-full min-h-0 w-[15rem] shrink-0 flex-col overflow-hidden border-r border-black/[0.09] lg:flex xl:w-[15.5rem]">
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

        <div className="listing-creation-schedule-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="listing-creation-schedule-header shrink-0 border-b border-[#E5E7EB] px-4 py-2.5 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-[56rem] flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={onCancel}
                  className="lux-flat mb-1 inline-flex min-h-9 items-center gap-1 text-[13px] font-semibold text-[#073B83] hover:underline lg:hidden"
                >
                  <span aria-hidden>←</span> Option
                </button>
                <h2
                  id={titleId}
                  className="truncate text-[1.2rem] font-semibold leading-snug tracking-tight text-[#17191D] sm:text-[1.35rem]"
                  title={optionLabel}
                >
                  {optionLabel}
                </h2>
              </div>
              <p
                className={`shrink-0 pt-0.5 text-[11px] tabular-nums lg:hidden ${
                  persistLabel === 'Save failed' ? 'font-medium text-red-700' : 'text-[#667085]'
                }`}
                aria-live="polite"
              >
                {persistLabel ?? ''}
              </p>
            </div>
            <div className="mx-auto mt-2.5 w-full max-w-[56rem] lg:hidden">
              <ListingCreationMobileStepStrip
                items={navItems}
                ariaLabel="Schedule steps"
                onSelectIndex={selectScene}
              />
            </div>
          </header>

          <div className="listing-creation-schedule-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
            <div className="mx-auto w-full max-w-[56rem]">
              {saveError ? (
                <p className="mb-3 text-[12px] leading-snug text-red-800" role="alert">
                  Couldn’t save — {saveError}
                </p>
              ) : null}

              {scene.id === 'review' ? (
                <ScheduleReview
                  headingRef={sceneHeadingRef}
                  schedule={schedule}
                  option={option}
                  formatAmount={formatAmount}
                  onEdit={(id) => onSelectScene(TOUR_SCHEDULE_SCENES.findIndex((s) => s.id === id))}
                />
              ) : (
                <div className="w-full space-y-4">
                  <h3
                    ref={sceneHeadingRef}
                    tabIndex={-1}
                    className="mb-5 font-display text-[1.3rem] font-bold leading-snug tracking-tight text-ink outline-none focus:outline-none sm:text-[1.45rem]"
                  >
                    {sceneQuestion}
                  </h3>
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
                        : scene.id === 'capacity'
                          ? 'supplier-schedule-field-capacity'
                          : 'supplier-schedule-field-price'
                    }
                  >
                    <BookingOptionEditor
                      option={optionView}
                      currencyLabel={currencyLabel}
                      hasEndingDate={hasEndingDate}
                      onHasEndingDateChange={onHasEndingDateChange}
                      onChange={patchFromOption}
                      activeSection={
                        scene.id === 'when'
                          ? 'availability'
                          : scene.id === 'capacity'
                            ? 'schedule_capacity'
                            : 'schedule_pricing'
                      }
                      attempted={attempted}
                      guestsCeiling={guestsCeiling}
                      spotsCeiling={spotsCeiling}
                      formatAmount={formatAmount}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="listing-creation-schedule-footer shrink-0 border-t border-[#E5E7EB] px-4 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-[56rem] flex-col gap-1.5">
              {continueHint ? (
                <p id={hintId} className="text-[12px] leading-snug text-[#667085]" role="status">
                  {continueHint}
                </p>
              ) : !isTourScheduleSceneSatisfied(sceneIndex, schedule, option) && attempted ? (
                <p className="text-[12px] leading-snug text-[#667085]" role="status">
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
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="order-2 flex gap-2 sm:order-1">
                  {sceneIndex > 0 ? (
                    <button
                      type="button"
                      onClick={onBack}
                      className="touch-manipulation tv-btn-ghost !min-h-12 flex-1 sm:!min-h-10 sm:w-auto sm:flex-none"
                    >
                      Back
                    </button>
                  ) : (
                    <span className="hidden sm:block sm:min-w-[4.5rem]" aria-hidden />
                  )}
                  <button
                    type="button"
                    onClick={onSaveDraft}
                    className="touch-manipulation tv-btn-secondary !min-h-12 flex-1 sm:!min-h-10 sm:w-auto sm:flex-none"
                  >
                    Save draft
                  </button>
                </div>
                {lastScene ? (
                  <button
                    type="button"
                    onClick={onSaveReady}
                    className="touch-manipulation tv-btn-primary order-1 !min-h-12 w-full sm:order-2 sm:!min-h-10 sm:w-auto"
                  >
                    Finish schedule
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onContinue}
                    aria-describedby={continueHint ? hintId : undefined}
                    className="touch-manipulation tv-btn-primary order-1 !min-h-12 w-full sm:order-2 sm:!min-h-10 sm:w-auto"
                  >
                    Continue
                  </button>
                )}
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

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--lc-line,#E5E7EB)] bg-white px-4 py-4 sm:px-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-[17px] font-semibold tracking-tight text-ink">{title}</h4>
        <button
          type="button"
          onClick={onEdit}
          className="lux-flat shrink-0 rounded-md px-2 py-1 text-[12.5px] font-semibold text-finland hover:bg-finland/[0.06]"
        >
          Edit
        </button>
      </div>
      <dl className="space-y-2.5">{children}</dl>
    </section>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[14px] leading-snug sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className="min-w-0 font-medium text-ink">{value}</dd>
    </div>
  );
}

function ScheduleReview({
  headingRef,
  schedule,
  option,
  formatAmount,
  onEdit,
}: {
  headingRef: Ref<HTMLHeadingElement>;
  schedule: ListingOptionSchedule;
  option: ListingBookingOption;
  formatAmount: (n: number) => string;
  onEdit: (id: TourScheduleSceneId) => void;
}) {
  const whenIssues = schedulePeriodIssues(schedule, { startMode: option.startMode });
  const capacityIssues = scheduleCapacitySceneIssues(schedule, option);
  const pricingIssues = schedulePricingSceneIssues(schedule);
  const overlap = scheduleReadyOverlapIssue({ ...schedule, status: 'ready' }, option);
  const allIssues = [
    ...whenIssues,
    ...capacityIssues,
    ...pricingIssues,
    ...(overlap ? [overlap] : []),
    ...schedulePriceCapacityIssues(schedule, option).filter(
      (m) => !whenIssues.includes(m) && !capacityIssues.includes(m) && !pricingIssues.includes(m)
    ),
  ];
  const uniqueIssues = [...new Set(allIssues)];
  const ready = uniqueIssues.length === 0;

  const pricing = formatScheduleListPrice(schedule, option, formatAmount);
  const charge = optionChargeModel(option);
  const commissionPct = formatBpsAsPercent(SUPPLIER_PRICING_PREVIEW_COMMISSION_BPS);
  const pricingLines: Array<{
    label: string;
    customer: string;
    commission: string;
    earn: string;
  }> = [];

  const pushLine = (label: string, gross: number) => {
    const preview = previewSupplierEarningsFromGross(gross);
    pricingLines.push({
      label,
      customer: gross > 0 ? formatAmount(gross) : 'Not set',
      commission: preview ? formatAmount(preview.commissionMajor) : '—',
      earn: formatSupplierEarningsPreview(gross, formatAmount),
    });
  };

  if (charge === 'flat_group') {
    pushLine('Whole group', schedule.privateGroupPriceUsd ?? schedule.priceUsd);
  } else if (optionPricingMode(schedule) === 'age_dependent') {
    const cats = activePriceCategories(schedule);
    if (cats.length === 0) {
      pricingLines.push({
        label: 'Age categories',
        customer: 'Not set',
        commission: '—',
        earn: '—',
      });
    } else {
      for (const c of cats) {
        pushLine(c.label.trim() || 'Category', c.priceUsd);
      }
    }
  } else {
    pushLine('Per person', schedule.priceUsd);
  }

  return (
    <div className="w-full max-w-xl space-y-4">
      <div>
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-[1.45rem] font-bold leading-snug tracking-tight text-ink outline-none focus:outline-none sm:text-[1.65rem]"
        >
          Review your schedule
        </h3>
        <p className="mt-1.5 max-w-md text-[14px] leading-relaxed text-ink-muted">
          Check your availability, capacity, and pricing before making this schedule bookable.
        </p>
      </div>

      <ReviewSection title="Schedule & availability" onEdit={() => onEdit('when')}>
        <ReviewRow label="Schedule name" value={schedule.name.trim() || 'Not set'} />
        <ReviewRow
          label="Date range"
          value={formatScheduleListDates(schedule.availabilityDateFrom, schedule.availabilityDateTo)}
        />
        <ReviewRow label="Operating days" value={formatScheduleWeekdays(schedule.weekdays)} />
        <ReviewRow
          label="Departure times"
          value={
            formatScheduleDepartureSummary(schedule, option.startMode) ||
            formatScheduleListDeparture(schedule, option.startMode)
          }
        />
      </ReviewSection>

      <ReviewSection title="Capacity" onEdit={() => onEdit('capacity')}>
        <ReviewRow
          label="Seats per departure"
          value={
            schedule.maxSpotsPerSlot >= 1 ? `${schedule.maxSpotsPerSlot}` : 'Not set'
          }
        />
        <ReviewRow
          label="Min guests / booking"
          value={schedule.minPersons >= 1 ? `${schedule.minPersons}` : 'Not set'}
        />
        <ReviewRow
          label="Max guests / booking"
          value={
            schedule.maxPersons >= 1
              ? `${schedule.maxPersons}${
                  charge === 'flat_group' &&
                  typeof schedule.maxGroupsPerSlot === 'number' &&
                  schedule.maxGroupsPerSlot >= 1
                    ? ` · ${schedule.maxGroupsPerSlot} group${
                        schedule.maxGroupsPerSlot === 1 ? '' : 's'
                      }`
                    : ''
                }`
              : 'Not set'
          }
        />
      </ReviewSection>

      <ReviewSection title="Pricing" onEdit={() => onEdit('pricing')}>
        <ReviewRow label="Pricing model" value={pricing.model} />
        {pricingLines.map((line) => (
          <div
            key={line.label}
            className="rounded-lg border border-[var(--lc-line,#E5E7EB)] bg-[var(--lc-surface-subtle,#fafafb)] px-3.5 py-3"
          >
            <p className="text-[15px] font-semibold tracking-tight text-ink">{line.label}</p>
            <div className="mt-2 space-y-1 text-[13.5px] leading-snug">
              <p className="text-ink">
                Customer pays{' '}
                <span className="font-semibold tabular-nums">{line.customer}</span>
              </p>
              <p className="text-ink-muted">
                Traverion commission ({commissionPct}){' '}
                <span className="tabular-nums">{line.commission}</span>
              </p>
              <p className="text-ink">
                You receive{' '}
                <span className="text-[1.05rem] font-semibold tabular-nums tracking-tight">
                  {line.earn}
                </span>
              </p>
            </div>
          </div>
        ))}
      </ReviewSection>

      <section className="rounded-xl border border-[var(--lc-line,#E5E7EB)] bg-white px-4 py-4 sm:px-5">
        {ready ? (
          <>
            <div className="flex items-center gap-2">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full bg-finland/10 text-[11px] font-bold text-finland"
                aria-hidden
              >
                ✓
              </span>
              <h4 className="text-[17px] font-semibold tracking-tight text-ink">Ready to finish</h4>
            </div>
            <p className="mt-1.5 text-[14px] leading-snug text-ink-muted">
              Your schedule is complete and can be made bookable.
            </p>
          </>
        ) : (
          <>
            <h4 className="text-[17px] font-semibold tracking-tight text-ink">Not ready yet</h4>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[13.5px] leading-snug text-ink-muted">
              {uniqueIssues.slice(0, 6).map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
