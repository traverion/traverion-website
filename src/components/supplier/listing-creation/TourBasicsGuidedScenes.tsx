import { useEffect, useRef } from 'react';
import { MIN_LISTING_DESCRIPTION_LENGTH } from '../../../lib/listingQualityScore';
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
  removeTourHighlight,
  type ListingCreationSceneDirection,
  type TourBasicsSceneId,
} from '../../../lib/listing-creation-scenes';
import { ListingCreationIdentityPreview } from './ListingCreationIdentityPreview';
import { ListingCreationSceneFrame } from './ListingCreationSceneFrame';

const SCENE_SUPPORT: Record<TourBasicsSceneId, string> = {
  product_type: 'Choose the product travelers are actually booking.',
  identity: 'The name guests see first, and the language they will hear.',
  story: 'Write the experience in your own words. Highlights are optional.',
};

type TourBasicsFormSlice = {
  experienceKind: '' | 'tour' | 'ticket' | 'transportation';
  experienceLanguage: string;
  title: string;
  subtitle: string;
  description: string;
  highlights: string[];
};

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
      canSelectScene={(index) =>
        canSelectTourBasicsScene(index, sceneIndex, form, allowDirectSceneAccess)
      }
      onSelectScene={onSelectScene}
      direction={direction}
      headingRef={headingRef}
      headingId={headingId}
    >
      {scene.id === 'product_type' ? (
        <fieldset id="supplier-listing-field-category" className="min-w-0 max-w-xl">
          <legend className="sr-only">Product type</legend>
          <div className="space-y-2.5" role="radiogroup" aria-labelledby={headingId}>
            {TOUR_PRODUCT_TYPE_OPTIONS.map((opt) => {
              const selected = form.experienceKind === opt.id;
              return (
                <label
                  key={opt.id}
                  className={`flex min-h-11 cursor-pointer flex-col rounded-2xl border px-4 py-4 text-left transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-finland ${
                    selected
                      ? 'border-finland bg-finland/[0.07] ring-1 ring-finland/25'
                      : 'border-black/[0.08] bg-paper-raised hover:border-black/[0.14]'
                  }`}
                >
                  <input
                    type="radio"
                    name="experience-kind"
                    value={opt.id}
                    checked={selected}
                    onChange={() => onChange({ experienceKind: opt.id })}
                    className="sr-only"
                  />
                  <span className="text-base font-semibold text-ink">{opt.title}</span>
                  <span className="mt-1 text-sm leading-snug text-ink-muted">{opt.description}</span>
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
                A clear, specific name travelers will see in search and on the listing page.
              </p>
              <input
                id="supplier-listing-title"
                type="text"
                value={form.title}
                onChange={(e) => onChange({ title: e.target.value })}
                className="tv-input min-w-0 py-3 text-lg [overflow-wrap:anywhere]"
                placeholder="e.g. Old town walking tour · small groups"
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
              <input
                id="supplier-listing-subtitle"
                type="text"
                value={form.subtitle}
                maxLength={TOUR_BASICS_SUBTITLE_MAX}
                onChange={(e) => onChange({ subtitle: e.target.value.slice(0, TOUR_BASICS_SUBTITLE_MAX) })}
                className="tv-input min-w-0 [overflow-wrap:anywhere]"
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
              <select
                id="supplier-listing-experience-language"
                value={form.experienceLanguage}
                onChange={(e) => onChange({ experienceLanguage: e.target.value })}
                className="tv-input"
              >
                <option value="">Select language…</option>
                {languageOptions.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </select>
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
        </div>
      ) : null}
    </ListingCreationSceneFrame>
  );
}
