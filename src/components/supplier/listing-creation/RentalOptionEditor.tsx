import { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { rentalCategoryConfig } from '../../../lib/rental-categories';
import { formatBpsAsPercent, splitGrossByCommissionBps } from '../../../lib/commercial-money';
import {
  formatMinorAsEuro,
  rentalOptionDayPriceMinor,
  rentalOptionHourPriceMinor,
  rentalOptionRatesReady,
  rentalVariantComplete,
} from '../../../lib/rental-details';
import { formatMoney, normalizeCurrency } from '../../../lib/money';
import type { RentalDetails, RentalVariant } from '../../../types/rental';
import { StayField, StayHelp } from './StayCreatorUi';

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

/** Applicable option rates for the listing duration mode, e.g. "€25 / day" or "€6 / hour · €25 / day". */
export function formatRentalOptionRates(
  pricing: { pricePerHourMinor?: number | null; pricePerDayMinor?: number | null },
  mode: RentalDetails['durationMode'],
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

export const RENTAL_OPTION_STEPS = ['identity', 'inventory', 'pricing', 'review'] as const;

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
  const [attempted, setAttempted] = useState(false);
  const [step, setStep] = useState(0);

  const currency = normalizeCurrency(listingCurrency ?? rental.sharedPricing?.currency);
  const config = rentalCategoryConfig(rental.category);
  const attributeKeys = config?.variantAttributeKeys ?? [];
  const mode = rental.durationMode ?? 'daily';
  const needsHour = mode === 'hourly' || mode === 'both';
  const needsDay = mode === 'daily' || mode === 'both';
  const hourPrice = rentalOptionHourPriceMinor(variant);
  const dayPrice = rentalOptionDayPriceMinor(variant);

  useEffect(() => {
    if (!open) return;
    setAttempted(false);
    setStep(0);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => nameRef.current?.focus({ preventScroll: true }), 60);
    return () => {
      document.body.style.overflow = previous;
      window.clearTimeout(timer);
    };
  }, [open]);

  if (!open) return null;

  const nameMissing = !variant.name.trim();
  const quantityInvalid = !Number.isFinite(variant.quantity) || variant.quantity < 1;
  const priceInvalid = !rentalOptionRatesReady(variant, rental);
  const priceMessage =
    mode === 'hourly'
      ? 'Enter a price per hour.'
      : mode === 'both'
        ? 'Enter a price per hour and a price per day.'
        : 'Enter a price per day.';
  const canSave = !nameMissing && !quantityInvalid && !priceInvalid;
  const complete = rentalVariantComplete(variant, rental);

  const patch = (next: Partial<RentalVariant>) => onChange({ ...variant, ...next });

  const writeRate = (key: 'pricePerHourMinor' | 'pricePerDayMinor', minor: number | null) => {
    patch({
      pricingOverride: {
        ...(variant.pricingOverride ?? {}),
        currency,
        [key]: minor,
      },
    });
  };

  const setAttribute = (key: string, value: string) => {
    const attributes = { ...(variant.attributes ?? {}) };
    if (value.trim()) attributes[key] = value.slice(0, 120);
    else delete attributes[key];
    patch({ attributes });
  };

  const trySave = () => {
    if (!canSave) {
      setAttempted(true);
      if (nameMissing) {
        setStep(RENTAL_OPTION_STEPS.indexOf('identity'));
        nameRef.current?.focus();
        return;
      }
      if (quantityInvalid) {
        setStep(RENTAL_OPTION_STEPS.indexOf('inventory'));
        return;
      }
      setStep(RENTAL_OPTION_STEPS.indexOf('pricing'));
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
      lede: 'Name the size or model. Only the fields for this category are shown.',
    },
    inventory: {
      title: 'Inventory',
      lede: 'How many identical units of this option can be rented at once.',
    },
    pricing: {
      title: 'Pricing',
      lede:
        mode === 'hourly'
          ? 'The price a guest pays for one hour of this option.'
          : mode === 'both'
            ? 'The price a guest pays for one hour and for one day of this option.'
            : 'The price a guest pays for one day of this option.',
    },
    review: {
      title: 'Review',
      lede: 'Check this option, then save it on the listing.',
    },
  };

  const goTo = (id: (typeof steps)[number]) => setStep(steps.indexOf(id));

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
          <button type="button" className="tv-btn-primary min-h-11 px-4 text-sm font-semibold" onClick={trySave}>
            Save
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
              {attempted && nameMissing ? (
                <p className="stay-alert !mt-0" role="alert">
                  Name this option to continue.
                </p>
              ) : null}
              {attributeKeys.length > 0 ? (
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
              ) : null}
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
              <details className="rounded-xl border border-[#E6EAF0] bg-white px-3 py-2" defaultOpen={Boolean(variant.availabilityOverrideNote?.trim())}>
                <summary className="cursor-pointer py-1 text-sm font-semibold text-ink">Advanced notes</summary>
                <div className="pb-1 pt-3">
                  <StayField label="Notes for this option" optional>
                    <textarea
                      className="tv-input w-full resize-y py-2"
                      rows={3}
                      maxLength={240}
                      value={variant.availabilityOverrideNote ?? ''}
                      placeholder="Setup, fit, or anything that applies only to this option."
                      onChange={(e) => patch({ availabilityOverrideNote: e.target.value.slice(0, 240) })}
                    />
                  </StayField>
                  <StayHelp>Saved with the option. It does not close dates on the calendar.</StayHelp>
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
              <StayHelp>Ten identical units of this option means 10. Each option keeps its own stock.</StayHelp>
              {attempted && quantityInvalid ? (
                <p className="stay-alert !mt-0" role="alert">
                  Enter at least 1 unit.
                </p>
              ) : null}
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
              {needsHour ? (
                <OptionRateEarnings minor={hourPrice} unit="hour" currency={currency} commissionBps={commissionBps} />
              ) : null}
              {needsDay ? (
                <OptionRateEarnings minor={dayPrice} unit="day" currency={currency} commissionBps={commissionBps} />
              ) : null}
            </section>
          ) : null}

          {current === 'review' ? (
            <section aria-label="Review">
              <dl className="divide-y divide-[#E6EAF0] rounded-2xl border border-[#E6EAF0] bg-white">
                <ReviewLine label="Name" value={variant.name.trim() || 'Not named yet'} onEdit={() => goTo('identity')} />
                {attributeSummary ? <ReviewLine label="Specifications" value={attributeSummary} onEdit={() => goTo('identity')} /> : null}
                {variant.description?.trim() ? (
                  <ReviewLine label="Description" value={variant.description.trim()} onEdit={() => goTo('identity')} />
                ) : null}
                {variant.availabilityOverrideNote?.trim() ? (
                  <ReviewLine label="Notes" value={variant.availabilityOverrideNote.trim()} onEdit={() => goTo('identity')} />
                ) : null}
                <ReviewLine label="Units" value={String(variant.quantity)} onEdit={() => goTo('inventory')} />
                <ReviewLine
                  label="Price"
                  value={formatRentalOptionRates(
                    {
                      pricePerHourMinor: hourPrice,
                      pricePerDayMinor: dayPrice,
                    },
                    mode,
                    currency,
                  )}
                  onEdit={() => goTo('pricing')}
                />
              </dl>
              <p className={`mt-3 text-sm font-semibold ${complete ? 'text-[#073b83]' : 'text-ink-muted'}`} role="status">
                {complete ? 'Complete.' : priceMessage}
              </p>
            </section>
          ) : null}
        </div>
      </div>

      <footer className="shrink-0 border-t border-[#E6EAF0] bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 sm:flex-row-reverse">
          {current === 'review' ? (
            <button type="button" className="tv-btn-primary min-h-11 px-5 text-sm font-semibold" onClick={trySave}>
              Save option
            </button>
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
    <div className="flex items-start justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">{label}</dt>
        <dd className="mt-0.5 text-sm font-semibold text-ink">{value}</dd>
      </div>
      <button type="button" className="shrink-0 text-sm font-semibold text-[#073b83]" onClick={onEdit}>
        Edit
      </button>
    </div>
  );
}
