import { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { rentalCategoryConfig } from '../../../lib/rental-categories';
import {
  effectiveVariantPricing,
  formatMinorAsEuro,
  rentalVariantComplete,
} from '../../../lib/rental-details';
import { formatMoney, normalizeCurrency } from '../../../lib/money';
import type { RentalDetails, RentalPricing, RentalVariant } from '../../../types/rental';
import { StayChoice, StayField, StayHelp } from './StayCreatorUi';

type Props = {
  open: boolean;
  variant: RentalVariant;
  rental: RentalDetails;
  listingCurrency?: string;
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

/** One-line pricing summary for the rental duration mode, e.g. "€25 / day · €6 / hour". */
export function rentalPricingSummary(
  pricing: RentalPricing,
  mode: RentalDetails['durationMode'],
  currency?: string
): string {
  const parts: string[] = [];
  const m = mode ?? 'daily';
  if (m === 'daily' || m === 'both') {
    if (pricing.pricePerDayMinor != null && pricing.pricePerDayMinor > 0) {
      parts.push(`${formatRentalMinor(pricing.pricePerDayMinor, currency)} / day`);
    }
  }
  if (m === 'hourly' || m === 'both') {
    if (pricing.pricePerHourMinor != null && pricing.pricePerHourMinor > 0) {
      parts.push(`${formatRentalMinor(pricing.pricePerHourMinor, currency)} / hour`);
    }
  }
  return parts.length > 0 ? parts.join(' · ') : 'Not set yet';
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

export default function RentalOptionEditor({
  open,
  variant,
  rental,
  listingCurrency,
  onChange,
  onSave,
  onCancel,
}: Props) {
  const titleId = useId();
  const nameId = useId();
  const descriptionId = useId();
  const quantityId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [attempted, setAttempted] = useState(false);

  const currency = normalizeCurrency(listingCurrency ?? rental.sharedPricing?.currency);
  const mode = rental.durationMode ?? 'daily';
  const config = rentalCategoryConfig(rental.category);
  const attributeKeys = config?.variantAttributeKeys ?? [];
  const override = variant.pricingOverride ?? null;
  const overriding = override != null;

  useEffect(() => {
    if (!open) return;
    setAttempted(false);
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
  const canSave = !nameMissing && !quantityInvalid;
  const effective = effectiveVariantPricing(rental, variant);
  const sharedSummary = rentalPricingSummary(rental.sharedPricing ?? {}, mode, currency);
  const complete = rentalVariantComplete(variant, rental);

  const patch = (next: Partial<RentalVariant>) => onChange({ ...variant, ...next });

  const setAttribute = (key: string, value: string) => {
    const attributes = { ...(variant.attributes ?? {}) };
    if (value.trim()) attributes[key] = value.slice(0, 120);
    else delete attributes[key];
    patch({ attributes });
  };

  const patchOverride = (next: Partial<RentalPricing>) => {
    patch({ pricingOverride: { ...(override ?? {}), currency, ...next } });
  };

  const trySave = () => {
    if (!canSave) {
      setAttempted(true);
      if (nameMissing) nameRef.current?.focus();
      return;
    }
    onSave();
  };

  const attributeSummary = attributeKeys
    .map((a) => ((variant.attributes ?? {})[a.key] ?? '').trim())
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="stay-creator listing-creation-option-shell fixed inset-0 z-[80] !flex !flex-col bg-white"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <header className="border-b border-[#e5e7eb] bg-white pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 px-4 pb-2">
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1 pr-2 text-sm font-semibold text-finland"
            onClick={onCancel}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            Back
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
        <div className="mx-auto w-full max-w-xl space-y-5 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5">
          <div>
            <p className="stay-kicker">Rental option</p>
            <h3 className="stay-title font-display font-semibold">Edit this option</h3>
            <p className="stay-lede mt-2">
              Options are what customers pick — for example a size or model. Each has its own stock.
            </p>
          </div>

          <section className="stay-panel space-y-4" aria-label="Identity">
            <p className="stay-kicker">Identity</p>
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
            <StayField label="Description (optional)">
              <textarea
                id={descriptionId}
                className="tv-input w-full resize-y py-2"
                rows={3}
                maxLength={500}
                value={variant.description ?? ''}
                placeholder="What makes this option different?"
                onChange={(e) => patch({ description: e.target.value.slice(0, 500) })}
              />
            </StayField>
            <StayHelp>{(variant.description ?? '').length}/500</StayHelp>
            {attributeKeys.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {attributeKeys.map((attr) => (
                  <StayField key={attr.key} label={attr.label}>
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
          </section>

          <section className="stay-panel space-y-3" aria-label="Inventory">
            <p className="stay-kicker">Inventory</p>
            <StayField label="Identical units for this option">
              <RentalIntegerInput
                id={quantityId}
                value={variant.quantity}
                min={1}
                max={9999}
                stepper
                ariaLabel="Identical units for this option"
                onChange={(n) => patch({ quantity: n ?? 1 })}
              />
            </StayField>
            <StayHelp>
              Stock for this choice only (for example Size M). Not the number of guests, and not a total across all
              sizes. At least 1.
            </StayHelp>
            {attempted && quantityInvalid ? (
              <p className="stay-alert !mt-0" role="alert">
                Enter at least 1 unit.
              </p>
            ) : null}
          </section>

          <section className="stay-panel space-y-3" aria-label="Pricing">
            <p className="stay-kicker">Pricing</p>
            <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Pricing source">
              <StayChoice pressed={!overriding} onClick={() => patch({ pricingOverride: null })}>
                <span className="block">Use shared pricing</span>
                <span className="stay-help mt-0.5 block font-normal">{sharedSummary}</span>
              </StayChoice>
              <StayChoice
                pressed={overriding}
                onClick={() => {
                  if (overriding) return;
                  const shared = rental.sharedPricing ?? {};
                  patch({
                    pricingOverride: {
                      currency,
                      pricePerHourMinor: shared.pricePerHourMinor ?? null,
                      pricePerDayMinor: shared.pricePerDayMinor ?? null,
                    },
                  });
                }}
              >
                <span className="block">Custom price for this option</span>
                <span className="stay-help mt-0.5 block font-normal">Overrides the shared rate.</span>
              </StayChoice>
            </div>

            {overriding ? (
              <div className="space-y-3">
                {mode === 'daily' || mode === 'both' ? (
                  <StayField label="Price per day">
                    <RentalMoneyInput
                      value={override?.pricePerDayMinor}
                      currency={currency}
                      ariaLabel="Custom price per day"
                      onChange={(minor) => patchOverride({ pricePerDayMinor: minor })}
                    />
                  </StayField>
                ) : null}
                {mode === 'hourly' || mode === 'both' ? (
                  <StayField label="Price per hour">
                    <RentalMoneyInput
                      value={override?.pricePerHourMinor}
                      currency={currency}
                      ariaLabel="Custom price per hour"
                      onChange={(minor) => patchOverride({ pricePerHourMinor: minor })}
                    />
                  </StayField>
                ) : null}
                <StayHelp>
                  Enter amounts in {currency}. A blank field falls back to the shared rate.
                </StayHelp>
              </div>
            ) : (
              <StayHelp>
                This option follows the shared rates from the Pricing step
                {rental.sharedPricing?.pricePerDayMinor || rental.sharedPricing?.pricePerHourMinor
                  ? '.'
                  : ' — you can set them there after adding your options.'}
              </StayHelp>
            )}
          </section>

          <section className="stay-panel space-y-2" aria-label="Review">
            <p className="stay-kicker">Review</p>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Name</dt>
                <dd className="min-w-0 truncate text-right font-semibold text-ink">
                  {variant.name.trim() || 'Not named yet'}
                </dd>
              </div>
              {attributeSummary ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Details</dt>
                  <dd className="min-w-0 truncate text-right font-semibold text-ink">{attributeSummary}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Units</dt>
                <dd className="font-semibold text-ink">{variant.quantity}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Price</dt>
                <dd className="min-w-0 text-right font-semibold text-ink">
                  {rentalPricingSummary(effective, mode, currency)}
                  <span className="stay-help block font-normal">
                    {overriding ? 'Custom for this option' : 'Shared rate'}
                  </span>
                </dd>
              </div>
            </dl>
            <p
              className={`text-sm font-semibold ${complete ? 'text-[#073b83]' : 'text-ink-muted'}`}
              role="status"
            >
              {complete
                ? 'Complete — ready for customers.'
                : 'Pricing is still missing. Set shared rates in the Pricing step or add a custom price above.'}
            </p>
            <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse">
              <button type="button" className="tv-btn-primary min-h-11 px-5 text-sm font-semibold" onClick={trySave}>
                Save option
              </button>
              <button type="button" className="tv-btn-secondary min-h-11 px-5 text-sm font-semibold" onClick={onCancel}>
                Discard changes
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
