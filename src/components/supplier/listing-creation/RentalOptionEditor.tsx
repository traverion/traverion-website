import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft } from 'lucide-react';
import { rentalCategoryConfig } from '../../../lib/rental-categories';
import { formatBpsAsPercent, splitGrossByCommissionBps } from '../../../lib/commercial-money';
import {
  effectiveVariantDurationLimits,
  effectiveVariantDurationMode,
  formatMinorAsEuro,
  pruneRentalVariantAttributes,
  rentalDurationFieldIssue,
  rentalOptionDayPriceMinor,
  rentalOptionHourPriceMinor,
  rentalOptionNameReady,
  rentalOptionRatesReady,
  rentalVariantComplete,
  rentalVariantDurationLimitsReady,
} from '../../../lib/rental-details';
import { formatMoney, normalizeCurrency } from '../../../lib/money';
import type { RentalDetails, RentalDurationMode, RentalVariant } from '../../../types/rental';
import { StayChoice, StayField, StayHelp } from './StayCreatorUi';

type Props = {
  open: boolean;
  variant: RentalVariant;
  rental: RentalDetails;
  listingCurrency?: string;
  commissionBps: number | null;
  onChange: (next: RentalVariant) => void;
  onSave: () => void;
  onCancel: () => void;
};

/** Format a minor-unit amount in the listing currency (EUR uses the shared Euro helper). */
export function formatRentalMinor(minor: number | null | undefined, currency?: string): string {
  if (minor == null || !Number.isFinite(minor)) return '—';
  const code = normalizeCurrency(currency);
  if (code === 'EUR') return formatMinorAsEuro(minor);
  return formatMoney(minor / 100, code);
}

/** Applicable option rates for a duration mode, e.g. "€25 / day" or "€6 / hour · €25 / day". */
export function formatRentalOptionRates(
  pricing: { pricePerHourMinor?: number | null; pricePerDayMinor?: number | null },
  mode: RentalDurationMode | RentalDetails['durationMode'],
  currency?: string,
): string {
  const m = mode ?? 'daily';
  const parts: string[] = [];
  if ((m === 'hourly' || m === 'both') && pricing.pricePerHourMinor != null && pricing.pricePerHourMinor > 0) {
    parts.push(`${formatRentalMinor(pricing.pricePerHourMinor, currency)} / hour`);
  }
  if ((m === 'daily' || m === 'both') && pricing.pricePerDayMinor != null && pricing.pricePerDayMinor > 0) {
    parts.push(`${formatRentalMinor(pricing.pricePerDayMinor, currency)} / day`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Price needed';
}

function minorToDraft(minor: number | null | undefined): string {
  if (minor == null || !Number.isFinite(minor)) return '';
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

function draftToMinor(draft: string): number | null {
  const text = draft.trim().replace(',', '.');
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Money input in major currency units; reports minor units (major × 100). Empty reports null. */
export function RentalMoneyInput({
  id,
  value,
  onChange,
  currency,
  ariaLabel,
  placeholder = '0',
}: {
  id?: string;
  value: number | null | undefined;
  onChange: (minor: number | null) => void;
  currency?: string;
  ariaLabel: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(() => minorToDraft(value));
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    const parsed = draftToMinor(draftRef.current);
    if ((value ?? null) !== parsed) setDraft(minorToDraft(value));
  }, [value]);

  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        className="tv-input w-full"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => {
          const next = e.target.value.replace(/[^0-9.,]/g, '').slice(0, 10);
          setDraft(next);
          onChange(draftToMinor(next));
        }}
        onBlur={() => setDraft(minorToDraft(value))}
      />
      <span className="stay-help shrink-0 font-semibold" aria-hidden>
        {normalizeCurrency(currency)}
      </span>
    </div>
  );
}

/** Whole-number input with optional − / + steppers. Commits only values within [min, max]. */
export function RentalIntegerInput({
  id,
  value,
  onChange,
  min = 0,
  max = 9999,
  ariaLabel,
  placeholder,
  allowEmpty = false,
  stepper = false,
  suffix,
}: {
  id?: string;
  value: number | null | undefined;
  onChange: (next: number | null) => void;
  min?: number;
  max?: number;
  ariaLabel: string;
  placeholder?: string;
  allowEmpty?: boolean;
  stepper?: boolean;
  suffix?: string;
}) {
  const toDraft = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '' : String(v));
  const [draft, setDraft] = useState(() => toDraft(value));
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    const raw = draftRef.current;
    const parsed = raw === '' ? null : Number.parseInt(raw, 10);
    if ((value ?? null) !== parsed) setDraft(toDraft(value));
  }, [value]);

  const current = value ?? null;
  const step = (delta: number) => {
    const base = current ?? (delta > 0 ? min - 1 : min);
    const next = Math.min(max, Math.max(min, base + delta));
    setDraft(String(next));
    onChange(next);
  };

  return (
    <div className="flex items-center gap-2">
      {stepper ? (
        <button
          type="button"
          className="stay-step shrink-0"
          aria-label={`Decrease ${ariaLabel}`}
          disabled={current != null && current <= min}
          onClick={() => step(-1)}
        >
          −
        </button>
      ) : null}
      <input
        id={id}
        className={`tv-input w-full ${stepper ? 'text-center' : ''}`}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, '').slice(0, 5);
          setDraft(next);
          if (next === '') {
            if (allowEmpty) onChange(null);
            return;
          }
          const n = Number.parseInt(next, 10);
          if (n >= min && n <= max) onChange(n);
        }}
        onBlur={() => setDraft(toDraft(value))}
      />
      {stepper ? (
        <button
          type="button"
          className="stay-step shrink-0"
          aria-label={`Increase ${ariaLabel}`}
          disabled={current != null && current >= max}
          onClick={() => step(1)}
        >
          +
        </button>
      ) : null}
      {suffix ? (
        <span className="stay-help shrink-0 font-semibold" aria-hidden>
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export const RENTAL_OPTION_STEPS = [
  'identity',
  'inventory',
  'duration-mode',
  'duration-limits',
  'pricing',
  'review',
] as const;

function optionModeLabel(mode: RentalDurationMode): string {
  if (mode === 'hourly') return 'Hourly';
  if (mode === 'both') return 'Hourly and daily';
  return 'Daily';
}

function optionLimitsSummary(variant: RentalVariant, rental: RentalDetails, mode: RentalDurationMode): string {
  const parts: string[] = [];
  if (mode === 'hourly' || mode === 'both') {
    const { min, max } = effectiveVariantDurationLimits(rental, variant, 'hour');
    parts.push(`${min}–${max} h`);
  }
  if (mode === 'daily' || mode === 'both') {
    const { min, max } = effectiveVariantDurationLimits(rental, variant, 'day');
    parts.push(`${min}–${max} days`);
  }
  return parts.join(' · ');
}

export default function RentalOptionEditor({
  open,
  variant,
  rental,
  listingCurrency,
  commissionBps,
  onChange,
  onSave,
  onCancel,
}: Props) {
  const titleId = useId();
  const nameId = useId();
  const descriptionId = useId();
  const quantityId = useId();
  const priceId = useId();
  const hourPriceId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const prunedOpenRef = useRef(false);
  const [attempted, setAttempted] = useState(false);
  const [step, setStep] = useState(0);
  /** Which rate’s earnings panel to emphasize when both hourly and daily are enabled. */
  const [earningsFocus, setEarningsFocus] = useState<'hour' | 'day'>('day');

  const currency = normalizeCurrency(listingCurrency ?? rental.sharedPricing?.currency);
  const config = rentalCategoryConfig(rental.category);
  const attributeKeys = config?.variantAttributeKeys ?? [];
  const mode = effectiveVariantDurationMode(rental, variant);
  const hasOwnMode = Boolean(variant.durationMode);
  const needsHour = mode === 'hourly' || mode === 'both';
  const needsDay = mode === 'daily' || mode === 'both';
  const hourPrice = rentalOptionHourPriceMinor(variant);
  const dayPrice = rentalOptionDayPriceMinor(variant);

  useEffect(() => {
    if (!open) {
      prunedOpenRef.current = false;
      return;
    }
    setAttempted(false);
    setStep(0);
    setEarningsFocus(mode === 'hourly' ? 'hour' : 'day');
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => nameRef.current?.focus({ preventScroll: true }), 60);
    return () => {
      document.body.style.overflow = previous;
      window.clearTimeout(timer);
    };
    // Reset UI when the dialog opens; mode is re-read from the variant on that open.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open-session reset only
  }, [open]);

  useEffect(() => {
    if (!open || prunedOpenRef.current) return;
    prunedOpenRef.current = true;
    const allowed = attributeKeys.map((row) => row.key);
    const pruned = pruneRentalVariantAttributes(variant, allowed);
    if (pruned !== variant) onChange(pruned);
    // Intentionally run once per open session to strip stale category attributes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open-session prune only
  }, [open]);

  if (!open) return null;

  const nameMissing = !rentalOptionNameReady(variant.name);
  const quantityInvalid = !Number.isFinite(variant.quantity) || variant.quantity < 1;
  const modeMissing = !variant.durationMode && !rental.durationMode;
  const limitsInvalid = !rentalVariantDurationLimitsReady(variant, rental);
  const priceInvalid = !rentalOptionRatesReady(variant, rental);
  const priceMessage =
    mode === 'hourly'
      ? 'Enter a price per hour.'
      : mode === 'both'
        ? 'Enter a price per hour and a price per day.'
        : 'Enter a price per day.';
  const canSaveComplete = !nameMissing && !quantityInvalid && !modeMissing && !limitsInvalid && !priceInvalid;
  const complete = rentalVariantComplete(variant, rental);

  const missingItems: { id: (typeof RENTAL_OPTION_STEPS)[number]; label: string }[] = [];
  if (nameMissing) missingItems.push({ id: 'identity', label: 'Add an option name' });
  if (quantityInvalid) missingItems.push({ id: 'inventory', label: 'Set at least 1 unit' });
  if (modeMissing) missingItems.push({ id: 'duration-mode', label: 'Choose a rental type' });
  if (!modeMissing && limitsInvalid) missingItems.push({ id: 'duration-limits', label: 'Set valid duration limits' });
  if (priceInvalid) missingItems.push({ id: 'pricing', label: priceMessage.replace(/\.$/, '') });

  const patch = (next: Partial<RentalVariant>) => onChange({ ...variant, ...next });

  const chooseMode = (next: RentalDurationMode) => {
    const defaults: Partial<RentalVariant> = { durationMode: next };
    if ((next === 'hourly' || next === 'both') && variant.minDurationHours == null) {
      defaults.minDurationHours = rental.minDurationHours ?? 1;
    }
    if ((next === 'hourly' || next === 'both') && variant.maxDurationHours == null) {
      defaults.maxDurationHours = rental.maxDurationHours ?? 8;
    }
    if ((next === 'daily' || next === 'both') && variant.minDurationDays == null) {
      defaults.minDurationDays = rental.minDurationDays ?? 1;
    }
    if ((next === 'daily' || next === 'both') && variant.maxDurationDays == null) {
      defaults.maxDurationDays = rental.maxDurationDays ?? 14;
    }
    setEarningsFocus(next === 'hourly' ? 'hour' : 'day');
    patch(defaults);
  };

  const writeRate = (key: 'pricePerHourMinor' | 'pricePerDayMinor', minor: number | null) => {
    setEarningsFocus(key === 'pricePerHourMinor' ? 'hour' : 'day');
    patch({
      pricingOverride: {
        ...(variant.pricingOverride ?? {}),
        currency,
        [key]: minor,
      },
    });
  };

  const setAttribute = (key: string, value: string) => {
    const allowed = new Set(attributeKeys.map((row) => row.key));
    if (!allowed.has(key)) return;
    const attributes = { ...(variant.attributes ?? {}) };
    if (value.trim()) attributes[key] = value.slice(0, 120);
    else delete attributes[key];
    patch({ attributes });
  };

  const saveDraft = () => {
    onSave();
  };

  const trySaveComplete = () => {
    if (!canSaveComplete) {
      setAttempted(true);
      const first = missingItems[0];
      if (first) {
        setStep(RENTAL_OPTION_STEPS.indexOf(first.id));
        if (first.id === 'identity') nameRef.current?.focus();
      }
      return;
    }
    onSave();
  };

  const attributeSummary = attributeKeys
    .map((attribute) => {
      const value = ((variant.attributes ?? {})[attribute.key] ?? '').trim();
      return value ? `${attribute.label}: ${value}` : '';
    })
    .filter(Boolean)
    .join(' · ');

  const steps = RENTAL_OPTION_STEPS;
  const current = steps[Math.min(step, steps.length - 1)];
  const stepCopy: Record<(typeof steps)[number], { title: string; lede: string }> = {
    identity: {
      title: 'Identity and specifications',
      lede: config
        ? `Name this ${config.title.toLowerCase()} option. Only ${config.title.toLowerCase()} fields are shown.`
        : 'Name the size or model. Only the fields for this category are shown.',
    },
    inventory: {
      title: 'Inventory',
      lede: 'Set how many of this exact option guests can book at the same time.',
    },
    'duration-mode': {
      title: 'Rental type',
      lede: 'Choose whether guests book this option by the hour, by the day, or either.',
    },
    'duration-limits': {
      title: 'Duration limits',
      lede: 'Set the shortest and longest rental guests can book for this option.',
    },
    pricing: {
      title: 'Pricing',
      lede:
        mode === 'hourly'
          ? 'Set the guest price for one hour. Earnings update as you type.'
          : mode === 'both'
            ? 'Set guest prices for one hour and one day. Earnings update as you type.'
            : 'Set the guest price for one day. Earnings update as you type.',
    },
    review: {
      title: 'Review',
      lede: complete
        ? 'This option is ready to save on the listing.'
        : 'Finish the required fields, or save a draft and return later.',
    },
  };

  const goTo = (id: (typeof steps)[number]) => setStep(steps.indexOf(id));

  // When both rates are enabled, show earnings for both periods (1h and 1d).
  const earningsUnit: 'hour' | 'day' =
    mode === 'hourly'
      ? 'hour'
      : mode === 'daily'
        ? 'day'
        : hourPrice != null && dayPrice == null
          ? 'hour'
          : dayPrice != null && hourPrice == null
            ? 'day'
            : earningsFocus;

  const hourLimitsIssue =
    needsHour
      ? rentalDurationFieldIssue(
          variant.minDurationHours ?? rental.minDurationHours,
          variant.maxDurationHours ?? rental.maxDurationHours,
          'hours',
        )
      : null;
  const dayLimitsIssue =
    needsDay
      ? rentalDurationFieldIssue(
          variant.minDurationDays ?? rental.minDurationDays,
          variant.maxDurationDays ?? rental.maxDurationDays,
          'days',
        )
      : null;

  const modeOptions: { id: RentalDurationMode; title: string; body: string }[] = [
    { id: 'hourly', title: 'By the hour', body: 'Short rentals, such as a few hours on the trail.' },
    { id: 'daily', title: 'By the day', body: 'Full-day or multi-day rentals.' },
    { id: 'both', title: 'Hourly and daily', body: 'Customers pick whichever suits them.' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="stay-creator rental-creator fixed inset-0 z-[80] flex flex-col bg-white"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <header className="shrink-0 border-b border-[#E6EAF0] bg-white pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1 pr-2 text-sm font-semibold text-[#073b83]"
            onClick={onCancel}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            Options
          </button>
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-ink">
            {variant.name.trim() || 'New option'}
          </h2>
          <button
            type="button"
            className="tv-btn-primary min-h-11 px-4 text-sm font-semibold"
            onClick={() => (canSaveComplete ? trySaveComplete() : saveDraft())}
          >
            {canSaveComplete ? 'Save' : 'Draft'}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 sm:px-6">
          <div>
            <p className="stay-kicker">
              Option · {steps.indexOf(current) + 1} of {steps.length}
            </p>
            <h3 className="stay-title font-display font-semibold">{stepCopy[current].title}</h3>
            <p className="stay-lede">{stepCopy[current].lede}</p>
          </div>

          {current === 'identity' ? (
            <section className="space-y-4" aria-label="Identity and specifications">
              <StayField label="Option name">
                <input
                  id={nameId}
                  ref={nameRef}
                  className="tv-input w-full"
                  value={variant.name}
                  maxLength={80}
                  placeholder="e.g. Medium, Adult e-bike, Standard"
                  aria-required="true"
                  aria-invalid={attempted && nameMissing}
                  onChange={(e) => patch({ name: e.target.value.slice(0, 80) })}
                />
              </StayField>
              <StayHelp>Use a clear label travelers will recognize, such as a size or model.</StayHelp>
              {attempted && nameMissing ? (
                <p className="stay-alert !mt-0" role="alert">
                  {variant.name.trim() && /^new option$/i.test(variant.name.trim())
                    ? 'Replace “New option” with a clear size or model name.'
                    : 'Name this option to continue.'}
                </p>
              ) : null}
              {attributeKeys.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-ink">Specifications</p>
                  <p className="text-sm text-ink-muted">Optional details for this category only.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {attributeKeys.map((attr) => (
                      <StayField key={attr.key} label={attr.label} optional>
                        <input
                          className="tv-input w-full"
                          value={(variant.attributes ?? {})[attr.key] ?? ''}
                          maxLength={120}
                          placeholder={attr.placeholder}
                          onChange={(e) => setAttribute(attr.key, e.target.value)}
                        />
                      </StayField>
                    ))}
                  </div>
                </div>
              ) : (
                <StayHelp>This category has no extra specification fields for options.</StayHelp>
              )}
              <StayField label="Description" optional>
                <textarea
                  id={descriptionId}
                  className="tv-input w-full resize-y py-2"
                  rows={3}
                  maxLength={500}
                  value={variant.description ?? ''}
                  placeholder="What makes this size or model different?"
                  onChange={(e) => patch({ description: e.target.value.slice(0, 500) })}
                />
              </StayField>
              <details
                className="rounded-xl border border-[#E6EAF0] bg-white px-3 py-2"
                {...(variant.availabilityOverrideNote?.trim() ? { open: true as const } : {})}
              >
                <summary className="cursor-pointer py-1 text-sm font-semibold text-ink">Advanced notes</summary>
                <div className="pb-1 pt-3">
                  <StayField label="Private notes for this option" optional>
                    <textarea
                      className="tv-input w-full resize-y py-2"
                      rows={3}
                      maxLength={240}
                      value={variant.availabilityOverrideNote ?? ''}
                      placeholder="Fit tips, kit contents, or setup notes for your team."
                      onChange={(e) => patch({ availabilityOverrideNote: e.target.value.slice(0, 240) })}
                    />
                  </StayField>
                  <StayHelp>
                    Visible to your team with this option. It does not block calendar dates or change public
                    availability.
                  </StayHelp>
                </div>
              </details>
            </section>
          ) : null}

          {current === 'inventory' ? (
            <section className="space-y-3" aria-label="Inventory">
              <StayField label="Units available">
                <RentalIntegerInput
                  id={quantityId}
                  value={variant.quantity}
                  min={1}
                  max={9999}
                  stepper
                  ariaLabel="Units available for this option"
                  onChange={(n) => patch({ quantity: n ?? 1 })}
                />
              </StayField>
              <StayHelp>Number of identical units available for rent.</StayHelp>
              {attempted && quantityInvalid ? (
                <p className="stay-alert !mt-0" role="alert">
                  Enter at least 1 unit.
                </p>
              ) : null}
            </section>
          ) : null}

          {current === 'duration-mode' ? (
            <section className="grid gap-2" role="group" aria-label="Rental type">
              {modeOptions.map((option) => (
                <StayChoice
                  key={option.id}
                  pressed={hasOwnMode ? variant.durationMode === option.id : false}
                  onClick={() => chooseMode(option.id)}
                >
                  <span className="block">{option.title}</span>
                  <span className="stay-help mt-0.5 block font-normal">{option.body}</span>
                </StayChoice>
              ))}
              {attempted && modeMissing ? (
                <p className="stay-alert !mt-0" role="alert">
                  Choose how guests book this option.
                </p>
              ) : null}
            </section>
          ) : null}

          {current === 'duration-limits' ? (
            <section className="space-y-6" aria-label="Duration limits">
              {needsHour ? (
                <div className="space-y-3">
                  <p className="stay-kicker">Hourly rentals</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StayField label="Minimum hours">
                      <RentalIntegerInput
                        value={variant.minDurationHours ?? rental.minDurationHours}
                        min={1}
                        max={720}
                        allowEmpty
                        stepper
                        ariaLabel="Minimum hours"
                        onChange={(n) => patch({ minDurationHours: n })}
                      />
                    </StayField>
                    <StayField label="Maximum hours">
                      <RentalIntegerInput
                        value={variant.maxDurationHours ?? rental.maxDurationHours}
                        min={1}
                        max={720}
                        allowEmpty
                        stepper
                        ariaLabel="Maximum hours"
                        onChange={(n) => patch({ maxDurationHours: n })}
                      />
                    </StayField>
                  </div>
                  {attempted && hourLimitsIssue ? (
                    <p className="stay-alert !mt-0" role="alert">
                      {hourLimitsIssue}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {needsDay ? (
                <div className="space-y-3">
                  <p className="stay-kicker">Daily rentals</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StayField label="Minimum days">
                      <RentalIntegerInput
                        value={variant.minDurationDays ?? rental.minDurationDays}
                        min={1}
                        max={365}
                        allowEmpty
                        stepper
                        ariaLabel="Minimum days"
                        onChange={(n) => patch({ minDurationDays: n })}
                      />
                    </StayField>
                    <StayField label="Maximum days">
                      <RentalIntegerInput
                        value={variant.maxDurationDays ?? rental.maxDurationDays}
                        min={1}
                        max={365}
                        allowEmpty
                        stepper
                        ariaLabel="Maximum days"
                        onChange={(n) => patch({ maxDurationDays: n })}
                      />
                    </StayField>
                  </div>
                  {attempted && dayLimitsIssue ? (
                    <p className="stay-alert !mt-0" role="alert">
                      {dayLimitsIssue}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <StayHelp>Guests pick pickup and return inside your opening hours. Daily rentals count calendar days.</StayHelp>
            </section>
          ) : null}

          {current === 'pricing' ? (
            <section className="space-y-3" aria-label="Pricing">
              {needsHour ? (
                <StayField label="Price per hour">
                  <RentalMoneyInput
                    id={hourPriceId}
                    value={variant.pricingOverride?.pricePerHourMinor}
                    currency={currency}
                    ariaLabel="Price per hour"
                    placeholder=""
                    onChange={(minor) => writeRate('pricePerHourMinor', minor)}
                  />
                </StayField>
              ) : null}
              {needsDay ? (
                <StayField label="Price per day">
                  <RentalMoneyInput
                    id={priceId}
                    value={variant.pricingOverride?.pricePerDayMinor}
                    currency={currency}
                    ariaLabel="Price per day"
                    placeholder=""
                    onChange={(minor) => writeRate('pricePerDayMinor', minor)}
                  />
                </StayField>
              ) : null}
              {attempted && priceInvalid ? (
                <p className="stay-alert !mt-0" role="alert">
                  {priceMessage}
                </p>
              ) : null}
              {mode === 'both' ? (
                <div className="space-y-3">
                  <OptionRateEarnings
                    minor={hourPrice}
                    unit="hour"
                    currency={currency}
                    commissionBps={commissionBps}
                  />
                  <OptionRateEarnings
                    minor={dayPrice}
                    unit="day"
                    currency={currency}
                    commissionBps={commissionBps}
                  />
                </div>
              ) : (
                <OptionRateEarnings
                  minor={earningsUnit === 'hour' ? hourPrice : dayPrice}
                  unit={earningsUnit}
                  currency={currency}
                  commissionBps={commissionBps}
                />
              )}
            </section>
          ) : null}

          {current === 'review' ? (
            <section className="rental-option-review" aria-label="Review">
              <div
                className={`rental-option-review__status${complete ? ' rental-option-review__status--complete' : ''}`}
                role="status"
              >
                {complete ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
                ) : (
                  <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {complete ? 'Ready to save' : 'Still missing required details'}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {complete
                      ? 'Name, inventory, rental type, duration, and pricing are complete.'
                      : 'You can save a draft now. A complete option is required before Continue on Options.'}
                  </p>
                </div>
              </div>

              {!complete && missingItems.length > 0 ? (
                <ul className="rental-option-review__missing">
                  {missingItems.map((item) => (
                    <li key={item.id}>
                      <button type="button" className="rental-option-review__missing-link" onClick={() => goTo(item.id)}>
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <dl className="rental-option-review__card">
                <ReviewLine label="Name" value={variant.name.trim() || 'Not named yet'} onEdit={() => goTo('identity')} />
                <ReviewLine
                  label="Specifications"
                  value={attributeSummary || 'None added'}
                  onEdit={() => goTo('identity')}
                />
                {variant.description?.trim() ? (
                  <ReviewLine label="Description" value={variant.description.trim()} onEdit={() => goTo('identity')} />
                ) : null}
                {variant.availabilityOverrideNote?.trim() ? (
                  <ReviewLine
                    label="Notes"
                    value={variant.availabilityOverrideNote.trim()}
                    onEdit={() => goTo('identity')}
                  />
                ) : null}
                <ReviewLine
                  label="Inventory"
                  value={`${variant.quantity} ${variant.quantity === 1 ? 'unit' : 'units'}`}
                  onEdit={() => goTo('inventory')}
                />
                <ReviewLine
                  label="Rental type"
                  value={hasOwnMode || rental.durationMode ? optionModeLabel(mode) : 'Not set'}
                  onEdit={() => goTo('duration-mode')}
                />
                <ReviewLine
                  label="Duration"
                  value={
                    hasOwnMode || rental.durationMode ? optionLimitsSummary(variant, rental, mode) : 'Not set'
                  }
                  onEdit={() => goTo('duration-limits')}
                />
                {needsHour ? (
                  <ReviewLine
                    label="Price per hour"
                    value={hourPrice != null ? `${formatRentalMinor(hourPrice, currency)} / hour` : 'Add pricing'}
                    onEdit={() => goTo('pricing')}
                  />
                ) : null}
                {needsDay ? (
                  <ReviewLine
                    label="Price per day"
                    value={dayPrice != null ? `${formatRentalMinor(dayPrice, currency)} / day` : 'Add pricing'}
                    onEdit={() => goTo('pricing')}
                  />
                ) : null}
              </dl>
            </section>
          ) : null}
        </div>
      </div>

      <footer className="shrink-0 border-t border-[#E6EAF0] bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 sm:flex-row-reverse">
          {current === 'review' ? (
            canSaveComplete ? (
              <button type="button" className="tv-btn-primary min-h-11 px-5 text-sm font-semibold" onClick={trySaveComplete}>
                Save option
              </button>
            ) : (
              <button type="button" className="tv-btn-primary min-h-11 px-5 text-sm font-semibold" onClick={saveDraft}>
                Save draft
              </button>
            )
          ) : (
            <button
              type="button"
              className="tv-btn-primary min-h-11 px-5 text-sm font-semibold"
              onClick={() => {
                if (current === 'identity' && nameMissing) {
                  setAttempted(true);
                  nameRef.current?.focus();
                  return;
                }
                if (current === 'inventory' && quantityInvalid) {
                  setAttempted(true);
                  return;
                }
                if (current === 'duration-mode' && modeMissing) {
                  setAttempted(true);
                  return;
                }
                if (current === 'duration-limits' && limitsInvalid) {
                  setAttempted(true);
                  return;
                }
                if (current === 'pricing' && priceInvalid) {
                  setAttempted(true);
                  return;
                }
                setStep((value) => Math.min(steps.length - 1, value + 1));
              }}
            >
              Continue
            </button>
          )}
          <button
            type="button"
            className="tv-btn-secondary min-h-11 px-5 text-sm font-semibold"
            onClick={() => {
              if (step === 0) onCancel();
              else setStep((value) => Math.max(0, value - 1));
            }}
          >
            Back
          </button>
        </div>
      </footer>
    </div>
  );
}

function OptionRateEarnings({
  minor,
  unit,
  currency,
  commissionBps,
}: {
  minor: number | null;
  unit: 'hour' | 'day';
  currency: string;
  commissionBps: number | null;
}) {
  if (minor == null || minor <= 0) return null;
  let split: { commissionMinor: number; supplierMinor: number } | null = null;
  let percent = '';
  if (commissionBps != null) {
    try {
      const result = splitGrossByCommissionBps(minor, commissionBps);
      split = { commissionMinor: result.commissionMinor, supplierMinor: result.supplierMinor };
      percent = formatBpsAsPercent(commissionBps);
    } catch {
      split = null;
    }
  }
  const unitLabel = unit === 'hour' ? '1 hour' : '1 day';
  return (
    <section className="rounded-xl border border-[#E6EAF0] bg-white px-3 py-2.5" aria-label={`${unitLabel} earnings`}>
      <p className="stay-kicker">{unitLabel} · 1 unit</p>
      <dl className="mt-2 space-y-1.5 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-ink">Guest price</dt>
          <dd className="font-semibold text-ink">{formatRentalMinor(minor, currency)}</dd>
        </div>
        {split ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-muted">Traverion commission{percent ? ` (${percent})` : ''}</dt>
              <dd className="text-ink-muted">− {formatRentalMinor(split.commissionMinor, currency)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-[#E6EAF0] pt-1.5">
              <dt className="font-semibold text-ink">You earn</dt>
              <dd className="font-semibold text-[#073b83]">{formatRentalMinor(split.supplierMinor, currency)}</dd>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-muted">Earnings appear once your commercial terms load.</p>
        )}
      </dl>
    </section>
  );
}

function ReviewLine({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="rental-option-review__row">
      <div className="min-w-0">
        <dt className="rental-option-review__label">{label}</dt>
        <dd className="rental-option-review__value">{value}</dd>
      </div>
      <button type="button" className="rental-option-review__edit" onClick={onEdit}>
        Edit
      </button>
    </div>
  );
}
