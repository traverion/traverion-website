import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { SearchableMultiSelect } from '../../ui/SearchableMultiSelect';
import BookingContactPhoneField from './BookingContactPhoneField';
import {
  ACCESSIBILITY_FEATURES_CATALOG,
  NOT_SUITABLE_FOR_CATALOG,
  SPOKEN_LANGUAGE_CATALOG,
  WHAT_TO_BRING_CATALOG,
  accessibilityContradictionMessages,
  labelsForCatalogIds,
  suggestedWhatToBringGroups,
} from '../../../lib/listing-information-catalogs';
import { findOffPlatformListingTextIssues } from '../../../lib/listing-off-platform-text';
import { validateBookingContactPhone } from '../../../lib/listing-booking-contact-phone';

const MAX_KNOW_BEFORE = 800;
const MAX_ADDITIONAL = 800;
const MAX_LEGACY_BRING = 500;
const MAX_LEGACY_REQ = 500;
const MAX_LEGACY_A11Y = 500;

export type ListingInformationFormSlice = {
  experienceKind: '' | 'tour' | 'ticket' | 'transportation';
  knowBeforeYouGo: string;
  whatToBring: string;
  whatToBringIds: string[];
  requirementsNotes: string;
  notSuitableForIds: string[];
  accessibilitySummary: string;
  accessibilityFeatureIds: string[];
  additionalInfo: string;
  additionalLanguages: string[];
  bookingContactPhoneE164: string;
};

type Props = {
  form: ListingInformationFormSlice;
  onChange: (patch: Partial<ListingInformationFormSlice>) => void;
  /** Expand section C + focus phone when publish validation fails. */
  forceExpandSection?: 'guest' | 'suitability' | 'contact' | null;
  phoneError?: string | null;
  businessCountry?: string | null;
  businessPhoneHint?: string | null;
  showPhoneRequired?: boolean;
};

function AutoGrowTextarea({
  id,
  value,
  maxLength,
  onChange,
  placeholder,
  ariaInvalid,
  describedBy,
}: {
  id: string;
  value: string;
  maxLength: number;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaInvalid?: boolean;
  describedBy?: string;
}) {
  return (
    <textarea
      id={id}
      value={value}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
      rows={2}
      placeholder={placeholder}
      aria-invalid={ariaInvalid || undefined}
      aria-describedby={describedBy}
      className="tv-input min-h-[4.5rem] resize-y text-[15px] leading-relaxed"
    />
  );
}

function AccordionSection({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
  hasSaved,
}: {
  id: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  hasSaved: boolean;
}) {
  const panelId = `${id}-panel`;
  const headerId = `${id}-header`;
  return (
    <section
      className="overflow-hidden rounded-[var(--partner-radius,0.5rem)] border border-black/[0.08] bg-paper"
      id={id}
    >
      <h3 className="m-0">
        <button
          type="button"
          id={headerId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex w-full items-start gap-3 px-3.5 py-3 text-left sm:px-4"
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-semibold text-ink">{title}</span>
              {hasSaved ? (
                <span className="rounded bg-finland/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-finland">
                  Saved
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block text-[12px] leading-snug text-ink-muted">{summary}</span>
          </span>
          <ChevronDown
            className={`mt-0.5 h-4 w-4 shrink-0 text-ink-muted transition ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        hidden={!open}
        className={open ? 'border-t border-black/[0.06] px-3.5 pb-4 pt-3 sm:px-4' : undefined}
      >
        {open ? <div className="space-y-4">{children}</div> : null}
      </div>
    </section>
  );
}

export default function ListingInformationStage({
  form,
  onChange,
  forceExpandSection = null,
  phoneError = null,
  businessCountry = null,
  businessPhoneHint = null,
  showPhoneRequired = true,
}: Props) {
  const baseId = useId();
  const [openGuest, setOpenGuest] = useState(true);
  const [openSuitability, setOpenSuitability] = useState(false);
  const [openContact, setOpenContact] = useState(false);

  useEffect(() => {
    if (forceExpandSection === 'guest') setOpenGuest(true);
    if (forceExpandSection === 'suitability') setOpenSuitability(true);
    if (forceExpandSection === 'contact') setOpenContact(true);
  }, [forceExpandSection]);

  const bringOptions = useMemo(() => {
    const preferred = new Set(suggestedWhatToBringGroups(form.experienceKind));
    return [...WHAT_TO_BRING_CATALOG].sort((a, b) => {
      const ap = preferred.has(a.group) ? 0 : 1;
      const bp = preferred.has(b.group) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return 0;
    });
  }, [form.experienceKind]);

  const knowIssues = findOffPlatformListingTextIssues(form.knowBeforeYouGo);
  const additionalIssues = findOffPlatformListingTextIssues(form.additionalInfo);
  const contradictions = accessibilityContradictionMessages(
    form.notSuitableForIds,
    form.accessibilityFeatureIds
  );

  const guestSummary = useMemo(() => {
    const bits: string[] = [];
    if (form.knowBeforeYouGo.trim()) bits.push('Know before you go');
    if (form.whatToBringIds.length) {
      bits.push(`${form.whatToBringIds.length} packing item${form.whatToBringIds.length === 1 ? '' : 's'}`);
    } else if (form.whatToBring.trim()) {
      bits.push('Legacy packing notes');
    }
    return bits.length ? bits.join(' · ') : 'Optional preparation details';
  }, [form.knowBeforeYouGo, form.whatToBring, form.whatToBringIds]);

  const suitabilitySummary = useMemo(() => {
    const bits: string[] = [];
    if (form.notSuitableForIds.length) {
      bits.push(`${form.notSuitableForIds.length} restriction${form.notSuitableForIds.length === 1 ? '' : 's'}`);
    } else if (form.requirementsNotes.trim()) {
      bits.push('Legacy restrictions');
    }
    if (form.accessibilityFeatureIds.length) {
      bits.push(`${form.accessibilityFeatureIds.length} accessibility feature${form.accessibilityFeatureIds.length === 1 ? '' : 's'}`);
    } else if (form.accessibilitySummary.trim()) {
      bits.push('Legacy accessibility notes');
    }
    return bits.length ? bits.join(' · ') : 'Optional suitability details';
  }, [
    form.notSuitableForIds,
    form.requirementsNotes,
    form.accessibilityFeatureIds,
    form.accessibilitySummary,
  ]);

  const contactSummary = useMemo(() => {
    const bits: string[] = [];
    if (form.additionalLanguages.length) {
      bits.push(
        `${form.additionalLanguages.length} language${form.additionalLanguages.length === 1 ? '' : 's'}`
      );
    }
    if (form.additionalInfo.trim()) bits.push('Additional notes');
    if (form.bookingContactPhoneE164.trim()) {
      const v = validateBookingContactPhone(form.bookingContactPhoneE164);
      bits.push(v.ok ? 'Contact number set' : 'Contact number needs fix');
    } else if (showPhoneRequired) {
      bits.push('Contact number required to publish');
    }
    return bits.length ? bits.join(' · ') : 'Languages, notes, and booking contact';
  }, [
    form.additionalLanguages,
    form.additionalInfo,
    form.bookingContactPhoneE164,
    showPhoneRequired,
  ]);

  const knowPlaceholder =
    form.experienceKind === 'ticket'
      ? 'e.g. Arrive 15 minutes early; entry is timed…'
      : form.experienceKind === 'transportation'
        ? 'e.g. Driver waits 15 minutes; share flight number…'
        : 'e.g. Dress in layers; meeting point opens 10 minutes before…';

  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-[13px] leading-relaxed text-ink-muted">
        Optional details travelers see under Good to know. Expand a section to edit
        {form.experienceKind === 'ticket'
          ? ' — skip anything that does not apply to this ticket.'
          : form.experienceKind === 'transportation'
            ? ' — skip anything that does not apply to this transfer.'
            : ' — skip anything that does not apply.'}
      </p>

      <AccordionSection
        id={`${baseId}-guest`}
        title="Guest preparation"
        summary={guestSummary}
        open={openGuest}
        onToggle={() => setOpenGuest((v) => !v)}
        hasSaved={Boolean(form.knowBeforeYouGo.trim() || form.whatToBringIds.length || form.whatToBring.trim())}
      >
        <div id="supplier-listing-field-know-before" className="space-y-1.5">
          <label htmlFor={`${baseId}-know`} className="block text-[13px] font-semibold text-ink">
            Know before you go
          </label>
          <p className="text-[12px] leading-relaxed text-ink-muted">
            Arrival instructions, weather, timing, or preparation notes. Avoid repeating details already set
            under Options.
          </p>
          <AutoGrowTextarea
            id={`${baseId}-know`}
            value={form.knowBeforeYouGo}
            maxLength={MAX_KNOW_BEFORE}
            onChange={(knowBeforeYouGo) => onChange({ knowBeforeYouGo })}
            placeholder={knowPlaceholder}
            ariaInvalid={knowIssues.length > 0}
            describedBy={`${baseId}-know-count`}
          />
          <p id={`${baseId}-know-count`} className="text-[11px] tabular-nums text-ink-faint">
            {form.knowBeforeYouGo.length} / {MAX_KNOW_BEFORE}
          </p>
          {knowIssues.map((issue) => (
            <p key={issue.kind} className="text-[12px] text-amber-800" role="status">
              {issue.message}
            </p>
          ))}
        </div>

        <div id="supplier-listing-field-what-to-bring">
          <SearchableMultiSelect
            id={`${baseId}-bring`}
            label="What to bring"
            hint="Select items guests should pack. No free-text packing list."
            values={form.whatToBringIds}
            options={bringOptions}
            onChange={(whatToBringIds) => onChange({ whatToBringIds })}
            placeholder="Search packing items…"
          />
          {form.whatToBringIds.length > 0 ? (
            <p className="mt-1.5 text-[12px] text-ink-muted">
              Selected:{' '}
              {labelsForCatalogIds(form.whatToBringIds, WHAT_TO_BRING_CATALOG).join(', ')}
            </p>
          ) : null}
          {form.whatToBring.trim() ? (
            <div className="mt-3 space-y-1.5 rounded-md border border-amber-200/80 bg-amber-50/60 px-3 py-2.5">
              <p className="text-[12px] font-semibold text-ink">Previous packing notes (kept)</p>
              <p className="text-[12px] text-ink-muted">
                These notes stay on the listing until you clear them. Prefer selecting catalog items above.
              </p>
              <AutoGrowTextarea
                id={`${baseId}-legacy-bring`}
                value={form.whatToBring}
                maxLength={MAX_LEGACY_BRING}
                onChange={(whatToBring) => onChange({ whatToBring })}
              />
              <p className="text-[11px] tabular-nums text-ink-faint">
                {form.whatToBring.length} / {MAX_LEGACY_BRING}
              </p>
            </div>
          ) : null}
        </div>
      </AccordionSection>

      <AccordionSection
        id={`${baseId}-suitability`}
        title="Suitability & accessibility"
        summary={suitabilitySummary}
        open={openSuitability}
        onToggle={() => setOpenSuitability((v) => !v)}
        hasSaved={Boolean(
          form.notSuitableForIds.length ||
            form.accessibilityFeatureIds.length ||
            form.requirementsNotes.trim() ||
            form.accessibilitySummary.trim()
        )}
      >
        <div id="supplier-listing-field-requirements">
          <SearchableMultiSelect
            id={`${baseId}-not-suitable`}
            label="Not suitable for"
            hint="Select only restrictions that genuinely apply. Unnecessary restrictions may reduce bookings."
            values={form.notSuitableForIds}
            options={NOT_SUITABLE_FOR_CATALOG}
            onChange={(notSuitableForIds) => onChange({ notSuitableForIds })}
            placeholder="Search restrictions…"
          />
          {form.requirementsNotes.trim() ? (
            <div className="mt-3 space-y-1.5 rounded-md border border-amber-200/80 bg-amber-50/60 px-3 py-2.5">
              <p className="text-[12px] font-semibold text-ink">Previous requirements notes (kept)</p>
              <AutoGrowTextarea
                id={`${baseId}-legacy-req`}
                value={form.requirementsNotes}
                maxLength={MAX_LEGACY_REQ}
                onChange={(requirementsNotes) => onChange({ requirementsNotes })}
              />
            </div>
          ) : null}
        </div>

        <div id="supplier-listing-field-accessibility">
          <SearchableMultiSelect
            id={`${baseId}-a11y`}
            label="Accessibility features"
            hint="Only claim features you genuinely provide."
            values={form.accessibilityFeatureIds}
            options={ACCESSIBILITY_FEATURES_CATALOG}
            onChange={(accessibilityFeatureIds) => onChange({ accessibilityFeatureIds })}
            placeholder="Search accessibility features…"
            aria-invalid={contradictions.length > 0}
          />
          {contradictions.map((msg) => (
            <p key={msg} className="mt-1.5 text-[12px] text-red-600" role="alert">
              {msg}
            </p>
          ))}
          {form.accessibilitySummary.trim() ? (
            <div className="mt-3 space-y-1.5 rounded-md border border-amber-200/80 bg-amber-50/60 px-3 py-2.5">
              <p className="text-[12px] font-semibold text-ink">Previous accessibility notes (kept)</p>
              <AutoGrowTextarea
                id={`${baseId}-legacy-a11y`}
                value={form.accessibilitySummary}
                maxLength={MAX_LEGACY_A11Y}
                onChange={(accessibilitySummary) => onChange({ accessibilitySummary })}
              />
            </div>
          ) : null}
        </div>
      </AccordionSection>

      <AccordionSection
        id={`${baseId}-contact`}
        title="Languages & contact details"
        summary={contactSummary}
        open={openContact}
        onToggle={() => setOpenContact((v) => !v)}
        hasSaved={Boolean(
          form.additionalLanguages.length ||
            form.additionalInfo.trim() ||
            form.bookingContactPhoneE164.trim()
        )}
      >
        <div id="supplier-listing-field-languages">
          <SearchableMultiSelect
            id={`${baseId}-langs`}
            label="Spoken languages"
            hint="Languages available during the experience — not the same as listing language."
            values={form.additionalLanguages}
            options={SPOKEN_LANGUAGE_CATALOG}
            onChange={(additionalLanguages) => onChange({ additionalLanguages })}
            placeholder="Search languages…"
          />
        </div>

        <div id="supplier-listing-field-additional-info" className="space-y-1.5">
          <label htmlFor={`${baseId}-more`} className="block text-[13px] font-semibold text-ink">
            Additional important information
          </label>
          <p className="text-[12px] leading-relaxed text-ink-muted">
            Anything else guests should know that does not fit above.
          </p>
          <AutoGrowTextarea
            id={`${baseId}-more`}
            value={form.additionalInfo}
            maxLength={MAX_ADDITIONAL}
            onChange={(additionalInfo) => onChange({ additionalInfo })}
            placeholder="Optional notes shown with Good to know."
            ariaInvalid={additionalIssues.length > 0}
            describedBy={`${baseId}-more-count`}
          />
          <p id={`${baseId}-more-count`} className="text-[11px] tabular-nums text-ink-faint">
            {form.additionalInfo.length} / {MAX_ADDITIONAL}
          </p>
          {additionalIssues.map((issue) => (
            <p key={issue.kind} className="text-[12px] text-amber-800" role="status">
              {issue.message}
            </p>
          ))}
        </div>

        <BookingContactPhoneField
          valueE164={form.bookingContactPhoneE164}
          onChangeE164={(bookingContactPhoneE164) => onChange({ bookingContactPhoneE164 })}
          businessCountry={businessCountry}
          businessPhoneHint={businessPhoneHint}
          error={phoneError}
          requiredForPublish={showPhoneRequired}
        />
      </AccordionSection>
    </div>
  );
}
