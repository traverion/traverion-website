import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft } from 'lucide-react';
import { rentalCategoryConfig, rentalOptionVariantAttributes } from '../../../lib/rental-categories';
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
import { StayField, StayHelp } from './StayCreatorUi';

type Props = {
  open: boolean;
  variant: RentalVariant;
  rental: RentalDetails;
  listingCurrency?: string;
  /** Kept for parent API compatibility; earnings UI is not shown on the pricing step. */
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

  const code = normalizeCurrency(currency);
  const suffix = code === 'EUR' ? '€' : code;

  return (
    <div className="rental-option-money">
      <span className="rental-option-money__suffix" aria-hidden>
        {suffix}
      </span>
      <input
        id={id}
        className="tv-input rental-option-money__input"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder || '0'}
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => {
          const next = e.target.value.replace(/[^0-9.,]/g, '').slice(0, 10);
          setDraft(next);
          onChange(draftToMinor(next));
        }}
        onBlur={() => setDraft(minorToDraft(value))}
      />
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

/** Compact − / number / + control for option inventory (min 1). */
export function RentalQuantityStepper({
  id,
  value,
  onChange,
  min = 1,
  max = 9999,
  ariaLabel,
}: {
  id?: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  ariaLabel: string;
}) {
  const safe = Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : min;
  const [draft, setDraft] = useState(String(safe));
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    const parsed = draftRef.current === '' ? null : Number.parseInt(draftRef.current, 10);
    if (parsed !== safe) setDraft(String(safe));
  }, [safe]);

  const commit = (n: number) => {
    const next = Math.min(max, Math.max(min, Math.floor(n)));
    setDraft(String(next));
    onChange(next);
  };

  return (
    <div className="rental-option-qty" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        className="rental-option-qty__btn"
        aria-label={`Decrease ${ariaLabel}`}
        disabled={safe <= min}
        onClick={() => commit(safe - 1)}
      >
        −
      </button>
      <input
        id={id}
        className="rental-option-qty__input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, '').slice(0, 4);
          setDraft(next);
          if (next === '') return;
          const n = Number.parseInt(next, 10);
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
        onBlur={() => {
          if (draft === '') {
            commit(min);
            return;
          }
          const n = Number.parseInt(draft, 10);
          commit(Number.isFinite(n) ? n : min);
        }}
      />
      <button
        type="button"
        className="rental-option-qty__btn"
        aria-label={`Increase ${ariaLabel}`}
        disabled={safe >= max}
        onClick={() => commit(safe + 1)}
      >
        +
      </button>
    </div>
  );
}

/** Compact duration limit stepper; empty blur restores the last committed value or min. */
export function RentalLimitStepper({
  id,
  value,
  onChange,
  min = 1,
  max = 9999,
  ariaLabel,
}: {
  id?: string;
  value: number | null | undefined;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  ariaLabel: string;
}) {
  const safe =
    value != null && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : min;
  const [draft, setDraft] = useState(String(safe));
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    const parsed = draftRef.current === '' ? null : Number.parseInt(draftRef.current, 10);
    if (parsed !== safe) setDraft(String(safe));
  }, [safe]);

  const commit = (n: number) => {
    const next = Math.min(max, Math.max(min, Math.floor(n)));
    setDraft(String(next));
    onChange(next);
  };

  return (
    <div className="rental-option-limit-stepper" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        className="rental-option-limit-stepper__btn"
        aria-label={`Decrease ${ariaLabel}`}
        disabled={safe <= min}
        onClick={() => commit(safe - 1)}
      >
        −
      </button>
      <input
        id={id}
        className="rental-option-limit-stepper__input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, '').slice(0, 4);
          setDraft(next);
          if (next === '') return;
          const n = Number.parseInt(next, 10);
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
        onBlur={() => {
          if (draft === '') {
            commit(safe);
            return;
          }
          const n = Number.parseInt(draft, 10);
          commit(Number.isFinite(n) ? n : safe);
        }}
      />
      <button
        type="button"
        className="rental-option-limit-stepper__btn"
        aria-label={`Increase ${ariaLabel}`}
        disabled={safe >= max}
        onClick={() => commit(safe + 1)}
      >
        +
      </button>
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
  commissionBps: _commissionBps,
  onChange,
  onSave,
  onCancel,
}: Props) {
  void _commissionBps;
  const titleId = useId();
  const nameId = useId();
  const descriptionId = useId();
  const quantityId = useId();
  const priceId = useId();
  const hourPriceId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const prunedOpenRef = useRef(false);
  const savingRef = useRef(false);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);

  const currency = normalizeCurrency(listingCurrency ?? rental.sharedPricing?.currency);
  const config = rentalCategoryConfig(rental.category);
  const attributeKeys = rentalOptionVariantAttributes(rental.category, rental.itemType);
  const mode = effectiveVariantDurationMode(rental, variant);
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
    setSaving(false);
    savingRef.current = false;
    setStep(0);
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
    if (!open) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = 0;
    headingRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [open, step]);

  useEffect(() => {
    if (!open || prunedOpenRef.current) return;
    prunedOpenRef.current = true;
    const allowed = attributeKeys.map((row) => row.key);
    const pruned = pruneRentalVariantAttributes(variant, allowed);
    if (pruned !== variant) onChange(pruned);
    // Intentionally run once per open session to strip stale category / item-type attributes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open-session prune only
  }, [open]);

  if (!open) return null;

  const nameMissing = !rentalOptionNameReady(variant.name);
  const quantityInvalid = !Number.isFinite(variant.quantity) || variant.quantity < 1;
  /** Creator requires an explicit option-level rental type (listing mode is legacy fallback only). */
  const modeMissing = !variant.durationMode;
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
    // Keep existing min/max when switching types; only fill missing defaults.
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
    setAttempted(false);
    patch(defaults);
  };

  const writeRate = (key: 'pricePerHourMinor' | 'pricePerDayMinor', minor: number | null) => {
    const nextMinor = minor != null && minor > 0 ? minor : null;
    patch({
      pricingOverride: {
        ...(variant.pricingOverride ?? {}),
        currency,
        [key]: nextMinor,
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
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    onSave();
  };

  const trySaveComplete = () => {
    if (savingRef.current) return;
    if (!canSaveComplete) {
      setAttempted(true);
      const first = missingItems[0];
      if (first) {
        setStep(RENTAL_OPTION_STEPS.indexOf(first.id));
        if (first.id === 'identity') nameRef.current?.focus();
      }
      return;
    }
    savingRef.current = true;
    setSaving(true);
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
      title: 'Identity & specifications',
      lede: config
        ? `Name this option and add details that differ by size or model for ${config.title.toLowerCase()}.`
        : 'Name this option and add details that differ by size or model.',
    },
    inventory: {
      title: 'Inventory',
      lede: 'How many identical units of this option can be rented at the same time.',
    },
    'duration-mode': {
      title: 'Rental type',
      lede: 'How guests book this option. This controls which duration limits and prices appear next.',
    },
    'duration-limits': {
      title: 'Duration limits',
      lede:
        mode === 'hourly'
          ? 'Shortest and longest hourly rental for this option.'
          : mode === 'both'
            ? 'Shortest and longest hourly and daily rentals for this option.'
            : 'Shortest and longest daily rental for this option.',
    },
    pricing: {
      title: 'Pricing',
      lede: 'Set the rental price for this option.',
    },
    review: {
      title: 'Review',
      lede: complete
        ? 'Confirm the details, then save this option.'
        : 'Finish the required fields, or save a draft and return later.',
    },
  };

  const goTo = (id: (typeof steps)[number]) => setStep(steps.indexOf(id));

  const modeOptions: { id: RentalDurationMode; title: string; body: string }[] = [
    { id: 'hourly', title: 'Hourly', body: 'Guests book by the hour. Only hourly limits and pricing follow.' },
    { id: 'daily', title: 'Daily', body: 'Guests book by the day. Only daily limits and pricing follow.' },
    {
      id: 'both',
      title: 'Hourly & daily',
      body: 'Guests choose either. Both limit sets and both prices follow.',
    },
  ];

  const selectedMode = variant.durationMode ?? null;
  const showHourLimits = selectedMode === 'hourly' || selectedMode === 'both';
  const showDayLimits = selectedMode === 'daily' || selectedMode === 'both';
  const hourMin = variant.minDurationHours ?? rental.minDurationHours ?? 1;
  const hourMax = variant.maxDurationHours ?? rental.maxDurationHours ?? 8;
  const dayMin = variant.minDurationDays ?? rental.minDurationDays ?? 1;
  const dayMax = variant.maxDurationDays ?? rental.maxDurationDays ?? 14;
  const hourLimitsIssue = showHourLimits ? rentalDurationFieldIssue(hourMin, hourMax, 'hours') : null;
  const dayLimitsIssue = showDayLimits ? rentalDurationFieldIssue(dayMin, dayMax, 'days') : null;

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

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 sm:px-6">
          <div className="rental-option-step-intro scroll-mt-2">
            <p className="stay-kicker">
              Option · {steps.indexOf(current) + 1} of {steps.length}
            </p>
            <h3 ref={headingRef} className="stay-title font-display font-semibold">
              {stepCopy[current].title}
            </h3>
            <p className="stay-lede">{stepCopy[current].lede}</p>
          </div>

          {current === 'identity' ? (
            <section className="rental-option-identity space-y-5" aria-label="Identity and specifications">
              <div className="space-y-2">
                <StayField label="Option name" required>
                  <input
                    id={nameId}
                    ref={nameRef}
                    className="tv-input rental-option-identity__input w-full"
                    value={variant.name}
                    maxLength={65}
                    placeholder="e.g. Medium, Adult e-bike, Standard"
                    aria-required="true"
                    aria-invalid={attempted && nameMissing}
                    onChange={(e) => patch({ name: e.target.value.slice(0, 65) })}
                  />
                </StayField>
                <p className="rental-option-identity__hint">
                  A clear size or model name travelers will recognize
                  <span className="rental-option-identity__count" aria-hidden>
                    {variant.name.length}/65
                  </span>
                </p>
                {attempted && nameMissing ? (
                  <p className="stay-alert !mt-0" role="alert">
                    {variant.name.trim() && /^new option$/i.test(variant.name.trim())
                      ? 'Replace “New option” with a clear size or model name.'
                      : 'Name this option to continue.'}
                  </p>
                ) : null}
              </div>

              {attributeKeys.length > 0 ? (
                <div className="rental-option-identity__specs space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">Specifications</p>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      Optional fields for this {config?.title.toLowerCase() ?? 'rental'}
                      {rental.itemType ? ' item' : ''}. Listing-wide facts stay on Shared specifications.
                    </p>
                  </div>
                  <div className={`grid gap-3 ${attributeKeys.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                    {attributeKeys.map((attr) => (
                      <StayField key={attr.key} label={attr.label} optional>
                        <input
                          className="tv-input rental-option-identity__input w-full"
                          value={(variant.attributes ?? {})[attr.key] ?? ''}
                          maxLength={120}
                          placeholder={attr.placeholder}
                          onChange={(e) => setAttribute(attr.key, e.target.value)}
                        />
                      </StayField>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <StayField label="What makes this option different?" optional>
                  <textarea
                    id={descriptionId}
                    className="tv-input rental-option-identity__textarea w-full resize-y py-2.5"
                    rows={3}
                    maxLength={500}
                    value={variant.description ?? ''}
                    placeholder="e.g. Adult frame, studded tires, or a different kit"
                    onChange={(e) => patch({ description: e.target.value.slice(0, 500) })}
                  />
                </StayField>
                <StayHelp>Shown to travelers with this option. Skip if the name already covers it.</StayHelp>
              </div>

              <details
                className="rental-option-identity__advanced"
                {...(variant.availabilityOverrideNote?.trim() ? { open: true as const } : {})}
              >
                <summary>Team notes</summary>
                <div className="rental-option-identity__advanced-body">
                  <textarea
                    className="tv-input rental-option-identity__textarea w-full resize-y py-2.5"
                    rows={2}
                    maxLength={240}
                    value={variant.availabilityOverrideNote ?? ''}
                    placeholder="Private fit tips or setup notes for your team"
                    aria-label="Team notes for this option"
                    onChange={(e) => patch({ availabilityOverrideNote: e.target.value.slice(0, 240) })}
                  />
                  <StayHelp>Internal only. Does not change public availability or calendar stock.</StayHelp>
                </div>
              </details>
            </section>
          ) : null}

          {current === 'inventory' ? (
            <section className="rental-option-inventory space-y-4" aria-label="Inventory">
              <StayField label="Units available" required>
                <RentalQuantityStepper
                  id={quantityId}
                  value={variant.quantity}
                  min={1}
                  max={9999}
                  ariaLabel="Units available for this option"
                  onChange={(n) => patch({ quantity: n })}
                />
              </StayField>
              <StayHelp>
                Concurrent stock for this option. Overlapping bookings and preparation time between returns share
                these units.
              </StayHelp>
              {attempted && quantityInvalid ? (
                <p className="stay-alert !mt-0" role="alert">
                  Enter at least 1 unit.
                </p>
              ) : null}
            </section>
          ) : null}

          {current === 'duration-mode' ? (
            <section className="rental-option-mode space-y-3" role="radiogroup" aria-label="Rental type">
              {modeOptions.map((option) => {
                const selected = selectedMode === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`rental-option-mode__card${selected ? ' rental-option-mode__card--selected' : ''}`}
                    onClick={() => chooseMode(option.id)}
                  >
                    <span className="rental-option-mode__radio" aria-hidden>
                      <span className="rental-option-mode__radio-dot" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="rental-option-mode__title">{option.title}</span>
                      <span className="rental-option-mode__body">{option.body}</span>
                    </span>
                  </button>
                );
              })}
              {attempted && modeMissing ? (
                <p className="stay-alert !mt-0" role="alert">
                  Choose a rental type to continue.
                </p>
              ) : null}
            </section>
          ) : null}

          {current === 'duration-limits' ? (
            <section className="rental-option-limits space-y-5" aria-label="Duration limits">
              {!selectedMode ? (
                <p className="stay-alert !mt-0" role="alert">
                  Choose a rental type first.
                </p>
              ) : null}
              {showHourLimits ? (
                <div className="rental-option-limits__block space-y-3">
                  <p className="stay-kicker">Hourly limits</p>
                  <div className="rental-option-limits__row">
                    <StayField label="Minimum hours">
                      <RentalLimitStepper
                        value={hourMin}
                        min={1}
                        max={720}
                        ariaLabel="Minimum hours"
                        onChange={(n) => patch({ minDurationHours: n })}
                      />
                    </StayField>
                    <StayField label="Maximum hours">
                      <RentalLimitStepper
                        value={hourMax}
                        min={1}
                        max={720}
                        ariaLabel="Maximum hours"
                        onChange={(n) => patch({ maxDurationHours: n })}
                      />
                    </StayField>
                  </div>
                  {hourLimitsIssue && (attempted || (typeof hourMin === 'number' && typeof hourMax === 'number' && hourMax < hourMin)) ? (
                    <p className="rental-option-limits__error" role="alert">
                      {hourLimitsIssue}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {showDayLimits ? (
                <div className="rental-option-limits__block space-y-3">
                  <p className="stay-kicker">Daily limits</p>
                  <div className="rental-option-limits__row">
                    <StayField label="Minimum days">
                      <RentalLimitStepper
                        value={dayMin}
                        min={1}
                        max={365}
                        ariaLabel="Minimum days"
                        onChange={(n) => patch({ minDurationDays: n })}
                      />
                    </StayField>
                    <StayField label="Maximum days">
                      <RentalLimitStepper
                        value={dayMax}
                        min={1}
                        max={365}
                        ariaLabel="Maximum days"
                        onChange={(n) => patch({ maxDurationDays: n })}
                      />
                    </StayField>
                  </div>
                  {dayLimitsIssue && (attempted || (typeof dayMin === 'number' && typeof dayMax === 'number' && dayMax < dayMin)) ? (
                    <p className="rental-option-limits__error" role="alert">
                      {dayLimitsIssue}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {showDayLimits ? (
                <StayHelp>
                  Daily rentals count calendar days from pickup date to return date — not rolling 24-hour periods.
                  Guests stay inside your opening hours.
                </StayHelp>
              ) : (
                <StayHelp>Guests pick pickup and return inside your opening hours.</StayHelp>
              )}
            </section>
          ) : null}

          {current === 'pricing' ? (
            <section className="rental-option-pricing space-y-4" aria-label="Pricing">
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
                      ? 'Everything required for this option is set.'
                      : 'Save a draft anytime. A complete option is required before Continue on Options.'}
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

              <div className="rental-option-review__groups">
                <ReviewGroup title="Identity" onEdit={() => goTo('identity')}>
                  <ReviewFact label="Name" value={variant.name.trim() || 'Not named yet'} />
                  {attributeSummary ? <ReviewFact label="Specifications" value={attributeSummary} /> : null}
                  {variant.description?.trim() ? (
                    <ReviewFact label="Difference" value={variant.description.trim()} />
                  ) : null}
                  {variant.availabilityOverrideNote?.trim() ? (
                    <ReviewFact label="Team notes" value={variant.availabilityOverrideNote.trim()} />
                  ) : null}
                </ReviewGroup>

                <ReviewGroup title="Inventory" onEdit={() => goTo('inventory')}>
                  <ReviewFact
                    label="Units"
                    value={`${variant.quantity} ${variant.quantity === 1 ? 'unit' : 'units'}`}
                  />
                </ReviewGroup>

                <ReviewGroup
                  title="Rental duration"
                  onEdit={() => goTo(selectedMode ? 'duration-limits' : 'duration-mode')}
                >
                  <ReviewFact
                    label="Type"
                    value={selectedMode ? optionModeLabel(selectedMode) : 'Not set'}
                  />
                  {selectedMode ? (
                    <ReviewFact label="Limits" value={optionLimitsSummary(variant, rental, selectedMode)} />
                  ) : null}
                </ReviewGroup>

                <ReviewGroup title="Pricing" onEdit={() => goTo('pricing')}>
                  {needsHour ? (
                    <ReviewFact
                      label="Per hour"
                      value={hourPrice != null ? `${formatRentalMinor(hourPrice, currency)} / hour` : 'Add price'}
                    />
                  ) : null}
                  {needsDay ? (
                    <ReviewFact
                      label="Per day"
                      value={dayPrice != null ? `${formatRentalMinor(dayPrice, currency)} / day` : 'Add price'}
                    />
                  ) : null}
                </ReviewGroup>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <footer className="shrink-0 border-t border-[#E6EAF0] bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 sm:flex-row-reverse">
          {current === 'review' ? (
            canSaveComplete ? (
              <button
                type="button"
                className="tv-btn-primary min-h-11 px-5 text-sm font-semibold"
                disabled={saving}
                onClick={trySaveComplete}
              >
                {saving ? 'Saving…' : 'Save option'}
              </button>
            ) : (
              <button
                type="button"
                className="tv-btn-primary min-h-11 px-5 text-sm font-semibold"
                disabled={saving}
                onClick={saveDraft}
              >
                {saving ? 'Saving…' : 'Save draft'}
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
                if (current === 'duration-mode' && !variant.durationMode) {
                  setAttempted(true);
                  return;
                }
                if (current === 'duration-limits' && (!selectedMode || limitsInvalid)) {
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

function ReviewGroup({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rental-option-review__group">
      <div className="rental-option-review__group-head">
        <h4 className="rental-option-review__group-title">{title}</h4>
        <button type="button" className="rental-option-review__edit" onClick={onEdit}>
          Edit
        </button>
      </div>
      <dl className="rental-option-review__group-body">{children}</dl>
    </section>
  );
}

function ReviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rental-option-review__fact">
      <dt className="rental-option-review__label">{label}</dt>
      <dd className="rental-option-review__value">{value}</dd>
    </div>
  );
}
