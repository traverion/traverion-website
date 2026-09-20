import { ListingCreationSceneFrame } from './ListingCreationSceneFrame';
import BookingOptionEditor from '../BookingOptionEditor';
import {
  TOUR_OPTION_SCENE_COUNT,
  TOUR_OPTION_SCENES,
  tourOptionReadiness,
  tourOptionReadinessLabel,
  type TourOptionSceneId,
} from '../../../lib/listing-option-scenes';
import type { ListingCreationSceneDirection } from '../../../lib/listing-creation-scenes';
import type { ListingBookingOption } from '../../../types/listingExtras';
import { useEffect, useRef } from 'react';

const SUPPORT: Record<TourOptionSceneId, string> = {
  setup: 'A traveler-facing name and what makes this variant different.',
  meeting: 'The exact place for this option. Listing city is not enough.',
  pricing: 'One option can include Adult and Child prices. Do not create separate Adult/Child options.',
  schedule: 'Capacity and the days this option actually runs.',
  review: 'Save it ready, or keep a draft and finish later. Drafts are not bookable.',
};

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function TourOptionGuidedScenes({
  option,
  sceneIndex,
  direction,
  currencyLabel,
  hasEndingDate,
  onHasEndingDateChange,
  onSelectScene,
  onChange,
  priceSummary,
  validationMessages,
}: {
  option: ListingBookingOption;
  sceneIndex: number;
  direction: ListingCreationSceneDirection;
  currencyLabel: string;
  hasEndingDate: boolean;
  onHasEndingDateChange: (on: boolean) => void;
  onSelectScene: (index: number) => void;
  onChange: (patch: Partial<ListingBookingOption>) => void;
  priceSummary: string;
  validationMessages: string[];
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scene = TOUR_OPTION_SCENES[sceneIndex] ?? TOUR_OPTION_SCENES[0];
  const headingId = 'tour-option-scene-heading';

  useEffect(() => {
    headingRef.current?.focus();
  }, [sceneIndex]);

  return (
    <ListingCreationSceneFrame
      key={scene.id}
      question={scene.question}
      support={SUPPORT[scene.id]}
      sceneIndex={sceneIndex}
      sceneTotal={TOUR_OPTION_SCENE_COUNT}
      sceneLabels={TOUR_OPTION_SCENES.map((item) => item.label)}
      onSelectScene={onSelectScene}
      direction={direction}
      headingRef={headingRef}
      headingId={headingId}
    >
      {scene.id === 'review' ? (
        <OptionReviewSummary
          option={option}
          priceSummary={priceSummary}
          validationMessages={validationMessages}
          currencyLabel={currencyLabel}
        />
      ) : (
        <BookingOptionEditor
          option={option}
          currencyLabel={currencyLabel}
          hasEndingDate={hasEndingDate}
          onHasEndingDateChange={onHasEndingDateChange}
          onChange={onChange}
          activeSection={scene.id}
        />
      )}
    </ListingCreationSceneFrame>
  );
}

function OptionReviewSummary({
  option,
  priceSummary,
  validationMessages,
  currencyLabel,
}: {
  option: ListingBookingOption;
  priceSummary: string;
  validationMessages: string[];
  currencyLabel: string;
}) {
  const status = tourOptionReadiness(option, validationMessages);
  const days = option.weekdays
    .map((on, index) => (on ? WEEKDAY_LABELS[index] : null))
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-muted">
        Status:{' '}
        <span className={status === 'ready' ? 'font-semibold text-ink' : 'font-semibold text-ink'}>
          {tourOptionReadinessLabel(status)}
        </span>
        {status !== 'ready' ? ' — this option will not count as bookable until the gaps below are fixed.' : null}
      </p>
      <dl className="divide-y divide-black/[0.06] border-y border-black/[0.06]">
        <ReviewRow label="Name" value={option.name.trim() || 'Untitled option'} />
        <ReviewRow
          label="Type"
          value={
            option.isPrivate
              ? option.privatePricing === 'flat_group'
                ? `Private · flat group (${currencyLabel})`
                : 'Private · per person'
              : 'Shared'
          }
        />
        <ReviewRow
          label="Duration"
          value={[option.duration.trim() || 'Not set', option.startTime.trim() ? `starts ${option.startTime}` : '']
            .filter(Boolean)
            .join(' · ')}
        />
        <ReviewRow label="Meeting or pickup" value={option.pickupPlace.trim() || 'Not set'} />
        <ReviewRow label="Price" value={priceSummary || 'Not set'} />
        <ReviewRow
          label="Capacity"
          value={`${option.minPersons}–${option.maxPersons} guests · ${option.maxSpotsPerSlot} spots per departure`}
        />
        <ReviewRow label="Days" value={days || 'No weekdays selected'} />
      </dl>
      {validationMessages.length > 0 ? (
        <div role="status">
          <p className="text-sm font-semibold text-ink">Still needed</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
            {validationMessages.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">This option is ready to book once the listing is published.</p>
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}
