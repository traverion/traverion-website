import { useEffect, useRef } from 'react';
import {
  MAX_LISTING_TITLE_LENGTH,
  MIN_LISTING_TITLE_LENGTH,
  clampListingTitleInput,
} from '../../../lib/listingQualityScore';
import DestinationSearch from '../DestinationSearch';
import { travelerDestinationLabel, verifiedDestination, type VerifiedDestination } from '../../../lib/destination-place';
import {
  TOUR_BASICS_SCENE_COUNT,
  TOUR_BASICS_SCENES,
  TOUR_BASICS_SUBTITLE_MAX,
  TOUR_PRODUCT_TYPE_OPTIONS,
  canSelectTourBasicsScene,
  isTourBasicsSceneSatisfied,
  tourBasicsIdentityQuestion,
  type ListingCreationSceneDirection,
  type TourBasicsSceneId,
} from '../../../lib/listing-creation-scenes';
import PartnerSelect from '../PartnerSelect';
import { ListingCreationIdentityPreview } from './ListingCreationIdentityPreview';
import { ListingCreationSceneFrame } from './ListingCreationSceneFrame';

const SCENE_SUPPORT: Record<TourBasicsSceneId, string> = {
  product_type: 'What travelers are booking.',
  location: 'Listing language and where the product is based.',
  identity: 'Title and short introduction guests see first.',
};

type TourBasicsFormSlice = {
  experienceKind: '' | 'tour' | 'ticket' | 'transportation';
  experienceLanguage: string;
  city: string;
  country: string;
  destinationPlaceId: string;
  destinationCountryCode: string;
  destinationLat: number | null;
  destinationLng: number | null;
  destinationFormatted: string;
  title: string;
  subtitle: string;
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
  const selectedDestination = verifiedDestination({
    placeId: form.destinationPlaceId,
    city: form.city,
    country: form.country,
    countryCode: form.destinationCountryCode,
    lat: form.destinationLat,
    lng: form.destinationLng,
  });

  useEffect(() => {
    if (skipFocusRef.current) {
      skipFocusRef.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [sceneIndex]);

  const identityQuestion = tourBasicsIdentityQuestion(form.experienceKind);
  const question = scene.id === 'identity' ? identityQuestion : scene.question;

  return (
    <ListingCreationSceneFrame
      key={sceneIndex}
      question={question}
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
          <div className="space-y-2.5" role="radiogroup" aria-labelledby={headingId}>
            {TOUR_PRODUCT_TYPE_OPTIONS.map((opt) => {
              const selected = form.experienceKind === opt.id;
              return (
                <label
                  key={opt.id}
                  className={`lc-choice flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--partner-radius,0.5rem)] px-4 py-3.5 text-left ${
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
                    <span className="block text-[15px] font-semibold text-ink">{opt.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">{opt.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {form.experienceKind === 'transportation' ? (
            <p className="mt-3 max-w-xl text-[13px] leading-snug text-ink-muted">
              Transfers use options for vehicles, capacity, and pickup or drop-off notes. Set origin and
              destination clearly for travelers.
            </p>
          ) : form.experienceKind === 'ticket' ? (
            <p className="mt-3 max-w-xl text-[13px] leading-snug text-ink-muted">
              Admission products focus on venue and entry times. Pickup is optional — only add it if you
              actually collect guests.
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {scene.id === 'location' ? (
        <div className="max-w-xl space-y-4">
          <div id="supplier-listing-field-language">
            <label htmlFor="supplier-listing-experience-language" className="mb-1 block text-[13px] font-semibold text-ink">
              Listing language *
            </label>
            <p className="mb-1.5 text-[12px] text-ink-muted">
              Language of this listing’s title and description. Spoken guide languages are set under Experience.
            </p>
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
          <div id="supplier-listing-field-location">
            <DestinationSearch
              id="supplier-listing-destination"
              selected={selectedDestination}
              savedLabel={travelerDestinationLabel(form.city, form.country)}
              onSelect={(place: VerifiedDestination) =>
                onChange({
                  city: place.city,
                  country: place.country,
                  destinationPlaceId: place.placeId,
                  destinationCountryCode: place.countryCode,
                  destinationLat: place.lat,
                  destinationLng: place.lng,
                  destinationFormatted: place.formatted,
                })
              }
            />
          </div>
        </div>
      ) : null}

      {scene.id === 'identity' ? (
        <div
          className={
            form.title.trim()
              ? 'grid min-w-0 grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(0,36rem)_minmax(14rem,18rem)] xl:gap-10'
              : 'max-w-xl'
          }
        >
          <div className="max-w-xl space-y-4">
            <div id="supplier-listing-field-title">
              <label htmlFor="supplier-listing-title" className="mb-1 block text-[13px] font-semibold text-ink">
                Title *
              </label>
              <p className="mb-1.5 text-[12px] text-ink-muted">
                Search and listing headline · {MIN_LISTING_TITLE_LENGTH}–{MAX_LISTING_TITLE_LENGTH} characters
              </p>
              <input
                id="supplier-listing-title"
                type="text"
                value={form.title}
                onChange={(e) =>
                  onChange({ title: clampListingTitleInput(e.target.value, form.title) })
                }
                className="tv-input min-w-0 py-2.5 text-[15px] [overflow-wrap:anywhere]"
                placeholder={
                  form.experienceKind === 'ticket'
                    ? 'e.g. Northern Lights Science Centre Entry'
                    : form.experienceKind === 'transportation'
                      ? 'e.g. Private Airport Transfer to Levi'
                      : 'e.g. Guaranteed Northern Lights Tour'
                }
                minLength={MIN_LISTING_TITLE_LENGTH}
                maxLength={
                  form.title.length > MAX_LISTING_TITLE_LENGTH
                    ? undefined
                    : MAX_LISTING_TITLE_LENGTH
                }
                required
              />
              <p
                className={`mt-1 text-[12px] tabular-nums ${
                  form.title.length > MAX_LISTING_TITLE_LENGTH
                    ? 'text-red-600'
                    : 'text-ink-muted'
                }`}
              >
                {form.title.length} / {MAX_LISTING_TITLE_LENGTH}
                {form.title.length > MAX_LISTING_TITLE_LENGTH
                  ? ` · shorten to ${MAX_LISTING_TITLE_LENGTH} to publish`
                  : null}
              </p>
            </div>
            <div id="supplier-listing-field-subtitle">
              <label htmlFor="supplier-listing-subtitle" className="mb-1 block text-[13px] font-semibold text-ink">
                Subtitle *
              </label>
              <p className="mb-1.5 text-[12px] text-ink-muted">
                One line under the title · max {TOUR_BASICS_SUBTITLE_MAX}
              </p>
              <textarea
                id="supplier-listing-subtitle"
                value={form.subtitle}
                maxLength={TOUR_BASICS_SUBTITLE_MAX}
                onChange={(e) => onChange({ subtitle: e.target.value.slice(0, TOUR_BASICS_SUBTITLE_MAX) })}
                rows={3}
                className="tv-input min-h-[5.5rem] min-w-0 resize-y text-[15px] leading-relaxed [overflow-wrap:anywhere] sm:min-h-[6.5rem]"
                placeholder={
                  form.experienceKind === 'transportation'
                    ? 'e.g. Door-to-door private vehicle for up to 6 guests'
                    : 'e.g. Small-group evening hunt with a local guide'
                }
              />
              <p className="mt-1 text-[12px] tabular-nums text-ink-muted">
                {form.subtitle.length}/{TOUR_BASICS_SUBTITLE_MAX}
              </p>
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
    </ListingCreationSceneFrame>
  );
}
