import { useEffect, useId, useMemo, useRef } from 'react';
import { SearchableMultiSelect } from '../../ui/SearchableMultiSelect';
import BookingContactPhoneField from './BookingContactPhoneField';
import { ListingCreationSceneFrame } from './ListingCreationSceneFrame';
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
import {
  TOUR_INFORMATION_SCENES,
  canSelectTourInformationScene,
  isTourInformationSceneSatisfied,
} from '../../../lib/listing-information-scenes';
import type { ListingCreationSceneDirection } from '../../../lib/listing-creation-scenes';

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
  sceneIndex: number;
  direction: ListingCreationSceneDirection;
  farthestReached: number;
  allowDirectSceneAccess?: boolean;
  onSelectScene: (index: number) => void;
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

export default function ListingInformationStage({
  form,
  onChange,
  sceneIndex,
  direction,
  farthestReached,
  allowDirectSceneAccess = false,
  onSelectScene,
  phoneError = null,
  businessCountry = null,
  businessPhoneHint = null,
  showPhoneRequired = true,
}: Props) {
  const baseId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const skipFocusRef = useRef(true);
  const scene = TOUR_INFORMATION_SCENES[sceneIndex] ?? TOUR_INFORMATION_SCENES[0];
  const sceneLabels = TOUR_INFORMATION_SCENES.map((item) => item.label);
  const headingId = 'tour-information-scene-heading';

  useEffect(() => {
    if (skipFocusRef.current) {
      skipFocusRef.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [sceneIndex]);

  const knowBefore = form.knowBeforeYouGo ?? '';
  const whatToBring = form.whatToBring ?? '';
  const whatToBringIds = form.whatToBringIds ?? [];
  const requirementsNotes = form.requirementsNotes ?? '';
  const notSuitableForIds = form.notSuitableForIds ?? [];
  const accessibilitySummary = form.accessibilitySummary ?? '';
  const accessibilityFeatureIds = form.accessibilityFeatureIds ?? [];
  const additionalInfo = form.additionalInfo ?? '';
  const additionalLanguages = form.additionalLanguages ?? [];
  const bookingContactPhoneE164 = form.bookingContactPhoneE164 ?? '';

  const bringOptions = useMemo(() => {
    const preferred = new Set(suggestedWhatToBringGroups(form.experienceKind));
    return [...WHAT_TO_BRING_CATALOG].sort((a, b) => {
      const ap = preferred.has(a.group) ? 0 : 1;
      const bp = preferred.has(b.group) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return 0;
    });
  }, [form.experienceKind]);

  const knowIssues = findOffPlatformListingTextIssues(knowBefore);
  const additionalIssues = findOffPlatformListingTextIssues(additionalInfo);
  const contradictions = accessibilityContradictionMessages(
    notSuitableForIds,
    accessibilityFeatureIds
  );

  const knowPlaceholder =
    form.experienceKind === 'ticket'
      ? 'e.g. Arrive 15 minutes early; entry is timed…'
      : form.experienceKind === 'transportation'
        ? 'e.g. Driver waits 15 minutes; share flight number…'
        : 'e.g. Dress in layers; meeting point opens 10 minutes before…';

  return (
    <ListingCreationSceneFrame
      key={sceneIndex}
      question={scene.question}
      support={scene.support}
      sceneIndex={sceneIndex}
      sceneTotal={TOUR_INFORMATION_SCENE_COUNT}
      sceneLabels={sceneLabels}
      sceneProgressAriaLabel="Tour information scenes"
      canSelectScene={(index) =>
        canSelectTourInformationScene(index, sceneIndex, farthestReached, allowDirectSceneAccess)
      }
      isSceneComplete={(index) => isTourInformationSceneSatisfied(index, form, sceneIndex)}
      onSelectScene={onSelectScene}
      direction={direction}
      headingRef={headingRef}
      headingId={headingId}
    >
      <div className="max-w-[46rem] space-y-5">
        {scene.id === 'guest_preparation' ? (
          <>
            <div id="supplier-listing-field-know-before" className="space-y-1.5">
              <label htmlFor={`${baseId}-know`} className="block text-[13px] font-semibold text-ink">
                Know before you go
              </label>
              <p className="text-[12px] leading-relaxed text-ink-muted">
                Arrival instructions, weather, timing, or preparation notes. Avoid repeating details already
                set under Options.
              </p>
              <AutoGrowTextarea
                id={`${baseId}-know`}
                value={knowBefore}
                maxLength={MAX_KNOW_BEFORE}
                onChange={(knowBeforeYouGo) => onChange({ knowBeforeYouGo })}
                placeholder={knowPlaceholder}
                ariaInvalid={knowIssues.length > 0}
                describedBy={`${baseId}-know-count`}
              />
              <p id={`${baseId}-know-count`} className="text-[11px] tabular-nums text-ink-faint">
                {knowBefore.length} / {MAX_KNOW_BEFORE}
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
                hint="Select items guests should pack."
                values={whatToBringIds}
                options={bringOptions}
                onChange={(ids) => onChange({ whatToBringIds: ids })}
                placeholder="Search packing items…"
              />
              {whatToBringIds.length > 0 ? (
                <p className="mt-1.5 text-[12px] text-ink-muted">
                  Selected: {labelsForCatalogIds(whatToBringIds, WHAT_TO_BRING_CATALOG).join(', ')}
                </p>
              ) : null}
              {whatToBring.trim() ? (
                <div className="mt-3 space-y-1.5 rounded-md border border-amber-200/80 bg-amber-50/60 px-3 py-2.5">
                  <p className="text-[12px] font-semibold text-ink">Previous packing notes (kept)</p>
                  <p className="text-[12px] text-ink-muted">
                    These notes stay on the listing until you clear them. Prefer selecting catalog items
                    above.
                  </p>
                  <AutoGrowTextarea
                    id={`${baseId}-legacy-bring`}
                    value={whatToBring}
                    maxLength={MAX_LEGACY_BRING}
                    onChange={(next) => onChange({ whatToBring: next })}
                  />
                  <p className="text-[11px] tabular-nums text-ink-faint">
                    {whatToBring.length} / {MAX_LEGACY_BRING}
                  </p>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {scene.id === 'suitability' ? (
          <>
            <div id="supplier-listing-field-requirements">
              <SearchableMultiSelect
                id={`${baseId}-not-suitable`}
                label="Not suitable for"
                hint="Select only restrictions that genuinely apply. Unnecessary restrictions may reduce bookings."
                values={notSuitableForIds}
                options={NOT_SUITABLE_FOR_CATALOG}
                onChange={(ids) => onChange({ notSuitableForIds: ids })}
                placeholder="Search restrictions…"
              />
              {requirementsNotes.trim() ? (
                <div className="mt-3 space-y-1.5 rounded-md border border-amber-200/80 bg-amber-50/60 px-3 py-2.5">
                  <p className="text-[12px] font-semibold text-ink">Previous requirements notes (kept)</p>
                  <AutoGrowTextarea
                    id={`${baseId}-legacy-req`}
                    value={requirementsNotes}
                    maxLength={MAX_LEGACY_REQ}
                    onChange={(next) => onChange({ requirementsNotes: next })}
                  />
                </div>
              ) : null}
            </div>

            <div id="supplier-listing-field-accessibility">
              <SearchableMultiSelect
                id={`${baseId}-a11y`}
                label="Accessibility features"
                hint="Only claim features you genuinely provide."
                values={accessibilityFeatureIds}
                options={ACCESSIBILITY_FEATURES_CATALOG}
                onChange={(ids) => onChange({ accessibilityFeatureIds: ids })}
                placeholder="Search accessibility features…"
                aria-invalid={contradictions.length > 0}
              />
              {contradictions.map((msg) => (
                <p key={msg} className="mt-1.5 text-[12px] text-red-600" role="alert">
                  {msg}
                </p>
              ))}
              {accessibilitySummary.trim() ? (
                <div className="mt-3 space-y-1.5 rounded-md border border-amber-200/80 bg-amber-50/60 px-3 py-2.5">
                  <p className="text-[12px] font-semibold text-ink">Previous accessibility notes (kept)</p>
                  <AutoGrowTextarea
                    id={`${baseId}-legacy-a11y`}
                    value={accessibilitySummary}
                    maxLength={MAX_LEGACY_A11Y}
                    onChange={(next) => onChange({ accessibilitySummary: next })}
                  />
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {scene.id === 'languages_contact' ? (
          <>
            <div id="supplier-listing-field-languages">
              <SearchableMultiSelect
                id={`${baseId}-langs`}
                label="Spoken languages"
                hint="Languages available during the experience — not the same as listing language."
                values={additionalLanguages}
                options={SPOKEN_LANGUAGE_CATALOG}
                onChange={(ids) => onChange({ additionalLanguages: ids })}
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
                value={additionalInfo}
                maxLength={MAX_ADDITIONAL}
                onChange={(next) => onChange({ additionalInfo: next })}
                placeholder="Optional notes shown with Good to know."
                ariaInvalid={additionalIssues.length > 0}
                describedBy={`${baseId}-more-count`}
              />
              <p id={`${baseId}-more-count`} className="text-[11px] tabular-nums text-ink-faint">
                {additionalInfo.length} / {MAX_ADDITIONAL}
              </p>
              {additionalIssues.map((issue) => (
                <p key={issue.kind} className="text-[12px] text-amber-800" role="status">
                  {issue.message}
                </p>
              ))}
            </div>

            <BookingContactPhoneField
              valueE164={bookingContactPhoneE164}
              onChangeE164={(next) => onChange({ bookingContactPhoneE164: next })}
              businessCountry={businessCountry}
              businessPhoneHint={businessPhoneHint}
              error={phoneError}
              requiredForPublish={showPhoneRequired}
            />
          </>
        ) : null}
      </div>
    </ListingCreationSceneFrame>
  );
}
