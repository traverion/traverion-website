import { useEffect, useRef, type ReactNode } from 'react';
import { ListingCreationSceneFrame } from './ListingCreationSceneFrame';
import { TourOptionAvailabilityPricingSummary } from './TourOptionAvailabilityPricingSummary';
import BookingOptionEditor from '../BookingOptionEditor';
import {
  TOUR_OPTION_SCENE_COUNT,
  TOUR_OPTION_SCENES,
  tourOptionReadiness,
  tourOptionReadinessLabel,
  type TourOptionSceneId,
} from '../../../lib/listing-option-scenes';
import type { TourOptionConfigPanel } from '../../../lib/listing-option-progression';
import {
  isOptionAvailabilityConfigured,
  summarizeOptionAvailability,
  summarizeOptionCapacity,
} from '../../../lib/listing-option-progression';
import type { ListingCreationSceneDirection } from '../../../lib/listing-creation-scenes';
import type { ListingBookingOption } from '../../../types/listingExtras';

const SUPPORT: Record<TourOptionSceneId, string> = {
  setup: 'A traveler-facing name, why this variant exists, and how long it runs.',
  meeting: 'Choose meeting point or pickup, then add the exact place for this option.',
  availability_pricing: 'Configure when travelers can book this option and what they pay.',
  review: 'Finish only when this option is actually ready. Drafts are not bookable.',
};

export function TourOptionGuidedScenes({
  option,
  sceneIndex,
  direction,
  currencyLabel,
  hasEndingDate,
  onHasEndingDateChange,
  onSelectScene,
  canSelectScene,
  onChange,
  onConfigureAvailabilityPricing,
  formatAmount,
  priceSummary,
  validationMessages,
  attempted,
}: {
  option: ListingBookingOption;
  sceneIndex: number;
  direction: ListingCreationSceneDirection;
  currencyLabel: string;
  hasEndingDate: boolean;
  onHasEndingDateChange: (on: boolean) => void;
  onSelectScene: (index: number) => void;
  canSelectScene?: (index: number) => boolean;
  onChange: (patch: Partial<ListingBookingOption>) => void;
  onConfigureAvailabilityPricing: (panel: TourOptionConfigPanel) => void;
  formatAmount: (n: number) => string;
  priceSummary: string;
  validationMessages: string[];
  attempted?: boolean;
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
      canSelectScene={canSelectScene}
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
          onEdit={(index) => onSelectScene(index)}
          onConfigure={onConfigureAvailabilityPricing}
        />
      ) : scene.id === 'availability_pricing' ? (
        <TourOptionAvailabilityPricingSummary
          option={option}
          currencyLabel={currencyLabel}
          formatAmount={formatAmount}
          onConfigure={onConfigureAvailabilityPricing}
        />
      ) : (
        <BookingOptionEditor
          option={option}
          currencyLabel={currencyLabel}
          hasEndingDate={hasEndingDate}
          onHasEndingDateChange={onHasEndingDateChange}
          onChange={onChange}
          activeSection={scene.id}
          attempted={attempted}
        />
      )}
    </ListingCreationSceneFrame>
  );
}

function OptionReviewSummary({
  option,
  priceSummary,
  validationMessages,
  onEdit,
  onConfigure,
}: {
  option: ListingBookingOption;
  priceSummary: string;
  validationMessages: string[];
  onEdit: (sceneIndex: number) => void;
  onConfigure: (panel: TourOptionConfigPanel) => void;
}) {
  const status = tourOptionReadiness(option, validationMessages);
  const meeting =
    option.fulfillment === 'pickup'
      ? `Pickup · ${option.pickupPlace.trim() || 'Not set'}`
      : option.fulfillment === 'meeting_point'
        ? `Meeting point · ${option.pickupPlace.trim() || 'Not set'}`
        : option.pickupPlace.trim() || 'Not set';

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Status:{' '}
        <span className="font-semibold text-ink">{tourOptionReadinessLabel(status)}</span>
        {status !== 'ready' ? ' — this option will not count as bookable until the gaps below are fixed.' : null}
      </p>
      <ReviewBlock
        title="Option"
        complete={Boolean(option.name.trim() && option.duration.trim())}
        onEdit={() => onEdit(0)}
      >
        <p className="text-sm font-semibold text-ink">{option.name.trim() || 'Untitled option'}</p>
        <p className="text-sm text-ink-muted">
          {[option.duration.trim() || 'Duration not set', option.startTime.trim() ? `starts ${option.startTime}` : '']
            .filter(Boolean)
            .join(' · ')}
        </p>
      </ReviewBlock>
      <ReviewBlock title="Meeting / pickup" complete={option.pickupPlace.trim().length >= 8} onEdit={() => onEdit(1)}>
        <p className="text-sm text-ink">{meeting}</p>
      </ReviewBlock>
      <ReviewBlock
        title="Availability"
        complete={isOptionAvailabilityConfigured(option)}
        onEdit={() => onConfigure('availability')}
      >
        <p className="text-sm text-ink">{summarizeOptionAvailability(option)}</p>
      </ReviewBlock>
      <ReviewBlock
        title="Pricing"
        complete={Boolean(priceSummary && !/set price/i.test(priceSummary))}
        onEdit={() => onConfigure('pricing')}
      >
        <p className="text-sm text-ink">{priceSummary || 'Not set'}</p>
      </ReviewBlock>
      <ReviewBlock title="Capacity" complete={option.maxSpotsPerSlot >= 1} onEdit={() => onConfigure('capacity')}>
        <p className="text-sm text-ink">{summarizeOptionCapacity(option)}</p>
      </ReviewBlock>
      {validationMessages.length > 0 ? (
        <div className="lc-section rounded-xl px-4 py-4" role="status">
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

function ReviewBlock({
  title,
  complete,
  onEdit,
  children,
}: {
  title: string;
  complete: boolean;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <div className="lc-section rounded-xl px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{title}</p>
            <span
              className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${
                complete ? 'text-finland' : 'text-ink-muted'
              }`}
            >
              {complete ? 'Complete' : 'Needs work'}
            </span>
          </div>
          <div className="mt-2 space-y-0.5">{children}</div>
        </div>
        <button type="button" onClick={onEdit} className="tv-btn-ghost !min-h-10 shrink-0 px-3 text-xs">
          Edit
        </button>
      </div>
    </div>
  );
}
