import { useEffect, useRef } from 'react';
import { MIN_LISTING_DESCRIPTION_LENGTH, MIN_LISTING_TITLE_LENGTH } from '../../../lib/listingQualityScore';
import {
  TOUR_BASICS_DESCRIPTION_MAX,
  TOUR_BASICS_SCENE_COUNT,
  TOUR_BASICS_SCENES,
  TOUR_BASICS_SUBTITLE_MAX,
  TOUR_HIGHLIGHT_MAX,
  TOUR_PRODUCT_TYPE_OPTIONS,
  addTourHighlight,
  canAddTourHighlight,
  canSelectTourBasicsScene,
  isTourBasicsSceneSatisfied,
  removeTourHighlight,
  type ListingCreationSceneDirection,
  type TourBasicsSceneId,
} from '../../../lib/listing-creation-scenes';
import PartnerSelect from '../PartnerSelect';
import { ListingCreationIdentityPreview } from './ListingCreationIdentityPreview';
import { ListingCreationSceneFrame } from './ListingCreationSceneFrame';

const SCENE_SUPPORT: Record<TourBasicsSceneId, string> = {
  product_type: 'Choose the product travelers are actually booking.',
  identity: 'The name guests see first, and the language they will hear.',
  story: 'Write the experience in your own words. Difficulty and guest notes sit here too.',
};

type VenueSetting = 'unspecified' | 'indoor' | 'outdoor' | 'mixed';

type TourBasicsFormSlice = {
  experienceKind: '' | 'tour' | 'ticket' | 'transportation';
  experienceLanguage: string;
  title: string;
  subtitle: string;
  description: string;
  highlights: string[];
  difficulty: 'Easy' | 'Moderate' | 'Challenging';
  destination: string;
  accessibilitySummary: string;
  minGuestAge: string;
  venueSetting: VenueSetting;
  additionalLanguages: string[];
};

const VENUE_SETTING_OPTIONS: { value: VenueSetting; label: string }[] = [
  { value: 'unspecified', label: 'Not specified' },
  { value: 'indoor', label: 'Mostly indoor' },
  { value: 'outdoor', label: 'Mostly outdoor' },
  { value: 'mixed', label: 'Mix of indoor and outdoor' },
];

const MAX_ACCESSIBILITY_LENGTH = 500;

export function TourBasicsGuidedScenes({
  form,
  sceneIndex,
  direction,
  languageOptions,
  languageLabel,
  allowDirectSceneAccess = false,
  onSelectScene,
  onChange,
}: {
  form: TourBasicsFormSlice;
  sceneIndex: number;
  direction: ListingCreationSceneDirection;
  languageOptions: readonly { code: string; label: string }[];
  languageLabel: string | null;
  allowDirectSceneAccess?: boolean;
  onSelectScene: (index: number) => void;
  onChange: (patch: Partial<TourBasicsFormSlice>) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const skipFocusRef = useRef(true);
  const scene = TOUR_BASICS_SCENES[sceneIndex] ?? TOUR_BASICS_SCENES[0];
  const sceneLabels = TOUR_BASICS_SCENES.map((item) => item.label);
  const headingId = 'tour-basics-scene-heading';

  useEffect(() => {
    if (skipFocusRef.current) {
      skipFocusRef.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [sceneIndex]);

  return (
    <ListingCreationSceneFrame
      key={sceneIndex}
      question={scene.question}
      support={SCENE_SUPPORT[scene.id]}
      sceneIndex={sceneIndex}
      sceneTotal={TOUR_BASICS_SCENE_COUNT}
      sceneLabels={sceneLabels}
      sceneProgressAriaLabel="Tour basics scenes"
      canSelectScene={(index) =>
        canSelectTourBasicsScene(index, sceneIndex, form, allowDirectSceneAccess)
      }
      isSceneComplete={(index) => isTourBasicsSceneSatisfied(index, form)}
      onSelectScene={onSelectScene}
      direction={direction}
      headingRef={headingRef}
      headingId={headingId}
    >
      {scene.id === 'product_type' ? (
        <fieldset id="supplier-listing-field-category" className="min-w-0 max-w-2xl">
          <legend className="sr-only">Product type</legend>
          <div className="space-y-3" role="radiogroup" aria-labelledby={headingId}>
            {TOUR_PRODUCT_TYPE_OPTIONS.map((opt) => {
              const selected = form.experienceKind === opt.id;
              return (
                <label
                  key={opt.id}
                  className={`lc-choice flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl px-5 py-5 text-left ${
                    selected ? 'lc-choice--selected' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="experience-kind"
                    value={opt.id}
                    checked={selected}
                    onChange={() => onChange({ experienceKind: opt.id })}
                    className="mt-1 h-4 w-4 shrink-0 border-black/[0.2] text-finland focus:ring-finland"
                  />
                  <span className="min-w-0">
                    <span className="block text-base font-bold text-ink">{opt.title}</span>
                    <span className="mt-1 block text-sm leading-snug text-ink-muted">{opt.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {form.experienceKind === 'transportation' ? (
            <p className="mt-3 max-w-xl text-sm leading-snug text-ink-muted">
              Transfers use the same tour listing tools (options, start times, capacity). There is no separate
              dispatch board yet — set meeting points and pickup notes clearly for travelers.
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {scene.id === 'identity' ? (
          <div
            className={
              form.title.trim()
                ? 'grid min-w-0 grid-cols-1 items-start gap-10 xl:grid-cols-[minmax(0,36rem)_minmax(14rem,18rem)] xl:gap-14'
                : 'max-w-xl'
            }
          >
          <div className="max-w-xl space-y-7">
            <div id="supplier-listing-field-title">
              <label htmlFor="supplier-listing-title" className="mb-1 block text-sm font-semibold text-ink">
                Title *
              </label>
              <p className="mb-2 text-xs text-ink-muted">
                A clear, specific name travelers will see in search and on the listing page (at least{' '}
                {MIN_LISTING_TITLE_LENGTH} characters).
              </p>
              <input
                id="supplier-listing-title"
                type="text"
                value={form.title}
                onChange={(e) => onChange({ title: e.target.value })}
                className="tv-input min-w-0 py-3 text-lg [overflow-wrap:anywhere]"
                placeholder="e.g. Guaranteed Northern Lights Tour"
                minLength={MIN_LISTING_TITLE_LENGTH}
                required
              />
            </div>
            <div id="supplier-listing-field-subtitle">
              <label htmlFor="supplier-listing-subtitle" className="mb-1 block text-sm font-semibold text-ink">
                Subtitle *
              </label>
              <p className="mb-2 text-xs text-ink-muted">
                A short line under the title on the listing page (max {TOUR_BASICS_SUBTITLE_MAX} characters).
              </p>
              <textarea
                id="supplier-listing-subtitle"
                value={form.subtitle}
                maxLength={TOUR_BASICS_SUBTITLE_MAX}
                onChange={(e) => onChange({ subtitle: e.target.value.slice(0, TOUR_BASICS_SUBTITLE_MAX) })}
                rows={3}
                className="tv-input min-h-[5.5rem] min-w-0 resize-y [overflow-wrap:anywhere]"
              />
              <p className="mt-1 text-xs tabular-nums text-ink-muted">
                {form.subtitle.length}/{TOUR_BASICS_SUBTITLE_MAX}
              </p>
            </div>
            <div id="supplier-listing-field-language">
              <label htmlFor="supplier-listing-experience-language" className="mb-1 block text-sm font-semibold text-ink">
                Primary language *
              </label>
              <p className="mb-2 text-xs text-ink-muted">The main language guests hear during the tour.</p>
              <PartnerSelect
                id="supplier-listing-experience-language"
                value={form.experienceLanguage}
                placeholder="Select language…"
                onChange={(experienceLanguage) => onChange({ experienceLanguage })}
                options={[
                  { value: '', label: 'Select language…' },
                  ...languageOptions.map((o) => ({ value: o.code, label: o.label })),
                ]}
              />
            </div>
          </div>
          <div className="xl:sticky xl:top-2 min-w-0">
            <ListingCreationIdentityPreview
              title={form.title}
              subtitle={form.subtitle}
              languageLabel={languageLabel}
            />
          </div>
        </div>
      ) : null}

      {scene.id === 'story' ? (
        <div className="max-w-xl space-y-7">
          <div id="supplier-listing-field-description">
            <label htmlFor="supplier-listing-description" className="mb-1 block text-sm font-semibold text-ink">
              About this tour *
            </label>
            <p className="mb-2 text-xs text-ink-muted">
              Main description for guests (at least {MIN_LISTING_DESCRIPTION_LENGTH} characters to continue, max{' '}
              {TOUR_BASICS_DESCRIPTION_MAX}).
            </p>
            <textarea
              id="supplier-listing-description"
              value={form.description}
              maxLength={TOUR_BASICS_DESCRIPTION_MAX}
              onChange={(e) => onChange({ description: e.target.value.slice(0, TOUR_BASICS_DESCRIPTION_MAX) })}
              rows={9}
              className={`tv-input min-h-[12rem] break-words text-base leading-relaxed [overflow-wrap:anywhere] ${
                form.description.trim().length > 0 &&
                form.description.trim().length < MIN_LISTING_DESCRIPTION_LENGTH
                  ? 'border-amber-300 focus:border-amber-400 focus:ring-amber-200'
                  : ''
              }`}
              placeholder="What guests do, what makes it special, practical notes…"
              aria-invalid={
                form.description.trim().length > 0 &&
                form.description.trim().length < MIN_LISTING_DESCRIPTION_LENGTH
              }
              aria-describedby={
                form.description.trim().length > 0 &&
                form.description.trim().length < MIN_LISTING_DESCRIPTION_LENGTH
                  ? 'supplier-listing-description-hint supplier-listing-description-error'
                  : 'supplier-listing-description-hint'
              }
            />
            <p id="supplier-listing-description-hint" className="mt-1 text-xs tabular-nums text-ink-muted">
              {form.description.length}/{TOUR_BASICS_DESCRIPTION_MAX}
            </p>
            {form.description.trim().length > 0 &&
            form.description.trim().length < MIN_LISTING_DESCRIPTION_LENGTH ? (
              <p id="supplier-listing-description-error" className="mt-1.5 text-sm text-red-600" role="alert">
                Add at least {MIN_LISTING_DESCRIPTION_LENGTH} characters to continue — describe the tour, what guests
                should expect, and any practical details.
              </p>
            ) : null}
          </div>
          <div id="supplier-listing-field-highlights" className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-ink">Highlights (optional)</label>
              <p className="mt-1 text-xs text-ink-muted">
                Add the strongest reasons travelers should choose this tour. You can add up to {TOUR_HIGHLIGHT_MAX}.
              </p>
            </div>
            {form.highlights.map((line, index) => (
              <div key={`highlight-${index}`}>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <label
                    className="block text-xs font-medium text-ink-muted"
                    htmlFor={`supplier-listing-highlight-${index}`}
                  >
                    Highlight {index + 1}
                    {index < 2 ? '' : ' (optional)'}
                  </label>
                  {index >= 2 ? (
                    <button
                      type="button"
                      onClick={() => onChange({ highlights: removeTourHighlight(form.highlights, index) })}
                      className="lux-flat min-h-11 min-w-11 text-xs font-medium text-ink-muted hover:text-ink"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <input
                  id={`supplier-listing-highlight-${index}`}
                  type="text"
                  value={line}
                  onChange={(e) =>
                    onChange({
                      highlights: form.highlights.map((h, i) => (i === index ? e.target.value : h)),
                    })
                  }
                  className="tv-input min-w-0 break-words [overflow-wrap:anywhere]"
                  placeholder={index === 0 ? 'e.g. Skip-the-line entry' : `Optional highlight ${index + 1}`}
                />
              </div>
            ))}
            {canAddTourHighlight(form.highlights) ? (
              <button
                type="button"
                onClick={() => onChange({ highlights: addTourHighlight(form.highlights) })}
                className="lux-flat min-h-11 text-sm font-semibold text-finland"
              >
                + Add another highlight
              </button>
            ) : null}
          </div>
          <div id="supplier-listing-field-difficulty">
            <label htmlFor="supplier-listing-difficulty" className="mb-1 block text-sm font-semibold text-ink">
              Overall difficulty
            </label>
            <p className="mb-2 text-xs text-ink-muted">How demanding this tour feels for a typical guest.</p>
            <PartnerSelect
              id="supplier-listing-difficulty"
              value={form.difficulty}
              onChange={(difficulty) =>
                onChange({ difficulty: difficulty as TourBasicsFormSlice['difficulty'] })
              }
              options={[
                { value: 'Easy', label: 'Easy' },
                { value: 'Moderate', label: 'Moderate' },
                { value: 'Challenging', label: 'Challenging' },
              ]}
            />
          </div>
          <details
            id="supplier-listing-field-accessibility"
            className="group rounded-xl border border-black/[0.08] px-4 py-3"
          >
            <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
              <span>
                <span className="block text-sm font-semibold text-ink">Optional: good to know</span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  Place label, accessibility, age, setting, languages
                </span>
              </span>
              <span className="mt-0.5 shrink-0 text-xs font-medium text-finland">
                {form.destination.trim() ||
                form.accessibilitySummary.trim() ||
                form.minGuestAge.trim() ||
                (form.venueSetting && form.venueSetting !== 'unspecified') ||
                form.additionalLanguages.length > 0
                  ? 'Saved'
                  : 'Add'}
              </span>
            </summary>
            <div className="mt-4 space-y-4">
              <div id="supplier-listing-field-destination" className="space-y-2">
                <label className="block text-sm font-semibold text-ink">How it shows as a place</label>
                <input
                  type="text"
                  value={form.destination}
                  onChange={(e) => onChange({ destination: e.target.value })}
                  className="tv-input"
                  placeholder="e.g. coastal route · several towns — or leave blank"
                />
                <p className="text-xs text-ink-muted">
                  If blank, cards use city and country. Fill this only for a route-style label.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-ink">Accessibility &amp; mobility</label>
                <textarea
                  value={form.accessibilitySummary}
                  maxLength={MAX_ACCESSIBILITY_LENGTH}
                  onChange={(e) =>
                    onChange({ accessibilitySummary: e.target.value.slice(0, MAX_ACCESSIBILITY_LENGTH) })
                  }
                  rows={3}
                  className="tv-input"
                  placeholder="Steps, uneven ground, wheelchair access, hearing loops, etc."
                />
                <p className="mt-1 text-xs tabular-nums text-ink-muted">
                  {form.accessibilitySummary.length}/{MAX_ACCESSIBILITY_LENGTH}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-ink">Minimum guest age</label>
                  <input
                    type="text"
                    value={form.minGuestAge}
                    onChange={(e) => onChange({ minGuestAge: e.target.value })}
                    className="tv-input"
                    placeholder="e.g. 8+ or none"
                  />
                </div>
                <div id="supplier-listing-field-venue">
                  <label htmlFor="supplier-listing-venue" className="mb-1 block text-sm font-semibold text-ink">
                    Setting
                  </label>
                  <PartnerSelect
                    id="supplier-listing-venue"
                    value={form.venueSetting}
                    onChange={(venueSetting) => onChange({ venueSetting: venueSetting as VenueSetting })}
                    options={VENUE_SETTING_OPTIONS}
                  />
                </div>
              </div>
              <div id="supplier-listing-field-languages">
                <label className="mb-2 block text-sm font-semibold text-ink">Additional languages offered</label>
                <p className="mb-2 text-xs text-ink-muted">Besides the primary language you set earlier.</p>
                <div className="flex flex-wrap gap-2">
                  {languageOptions
                    .filter((o) => o.code !== 'other')
                    .map((o) => {
                      const disabled = o.code === form.experienceLanguage;
                      return (
                        <label
                          key={o.code}
                          className={`inline-flex items-center gap-1.5 ${disabled ? 'opacity-40' : ''}`}
                        >
                          <input
                            type="checkbox"
                            disabled={disabled}
                            checked={form.additionalLanguages.includes(o.code)}
                            onChange={() =>
                              onChange({
                                additionalLanguages: form.additionalLanguages.includes(o.code)
                                  ? form.additionalLanguages.filter((c) => c !== o.code)
                                  : [...form.additionalLanguages, o.code],
                              })
                            }
                            className="rounded border-black/[0.12] text-finland focus:ring-finland"
                          />
                          <span className="text-sm text-ink">{o.label}</span>
                        </label>
                      );
                    })}
                </div>
              </div>
            </div>
          </details>
        </div>
      ) : null}
    </ListingCreationSceneFrame>
  );
}
