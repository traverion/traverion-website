import { useEffect, useRef, type ReactNode } from 'react';
import { isTourOptionSceneSatisfied } from '../../../lib/listing-option-progression';
import { ListingCreationSceneFrame } from './ListingCreationSceneFrame';
import { TourOptionScheduleList } from './TourOptionScheduleList';
import BookingOptionEditor from '../BookingOptionEditor';
import {
  TOUR_OPTION_SCENE_COUNT,
  TOUR_OPTION_SCENES,
  tourOptionReadiness,
  tourOptionReadinessLabel,
  type TourOptionSceneId,
} from '../../../lib/listing-option-scenes';
import {
  formatScheduleRange,
  listingOptionReadySchedules,
  optionScheduleCountLabel,
  scheduleHeadlineName,
} from '../../../lib/listing-option-schedules';
import { optionHeadlineUnitPrice } from '../../../lib/price-categories';
import type { ListingCreationSceneDirection } from '../../../lib/listing-creation-scenes';
import type { ListingBookingOption, ListingOptionSchedule } from '../../../types/listingExtras';

const SUPPORT: Record<TourOptionSceneId, string> = {
  setup: 'Name this category of the tour, why travelers would pick it, and how long it runs.',
  meeting: 'Choose meeting point or pickup, then add the exact place for this option.',
  availability_pricing:
    'Add one or more schedules — for example September and October — each with its own dates, time, capacity, and price.',
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
  formatAmount,
  priceSummary,
  validationMessages,
  attempted,
  onAddSchedule,
  onEditSchedule,
  onDuplicateSchedule,
  onDeleteSchedule,
  pendingScheduleDeleteId,
  onCancelScheduleDelete,
  occupancyNoticeForSchedule,
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
  formatAmount: (n: number) => string;
  priceSummary: string;
  validationMessages: string[];
  attempted?: boolean;
  onAddSchedule: () => void;
  onEditSchedule: (scheduleId: string) => void;
  onDuplicateSchedule: (scheduleId: string) => void;
  onDeleteSchedule: (scheduleId: string) => void;
  pendingScheduleDeleteId: string | null;
  onCancelScheduleDelete: () => void;
  occupancyNoticeForSchedule?: (schedule: ListingOptionSchedule) => string | null;
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
      sceneProgressAriaLabel="Option setup scenes"
      canSelectScene={canSelectScene}
      isSceneComplete={(index) =>
        isTourOptionSceneSatisfied(index, option, { hasEndingDate })
      }
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
          formatAmount={formatAmount}
        />
      ) : scene.id === 'availability_pricing' ? (
        <TourOptionScheduleList
          option={option}
          formatAmount={formatAmount}
          onAdd={onAddSchedule}
          onEdit={onEditSchedule}
          onDuplicate={onDuplicateSchedule}
          onDelete={onDeleteSchedule}
          pendingDeleteId={pendingScheduleDeleteId}
          onCancelDelete={onCancelScheduleDelete}
          occupancyNoticeForSchedule={occupancyNoticeForSchedule}
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
  formatAmount,
}: {
  option: ListingBookingOption;
  priceSummary: string;
  validationMessages: string[];
  onEdit: (sceneIndex: number) => void;
  formatAmount: (n: number) => string;
}) {
  const status = tourOptionReadiness(option, validationMessages);
  const meeting =
    option.fulfillment === 'pickup'
      ? `Pickup · ${option.pickupPlace.trim() || 'Not set'}`
      : option.fulfillment === 'meeting_point'
        ? `Meeting point · ${option.pickupPlace.trim() || 'Not set'}`
        : option.pickupPlace.trim() || 'Not set';
  const ready = listingOptionReadySchedules(option);

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
        <p className="text-sm text-ink-muted">{option.duration.trim() || 'Duration not set'}</p>
      </ReviewBlock>
      <ReviewBlock title="Meeting / pickup" complete={option.pickupPlace.trim().length >= 8} onEdit={() => onEdit(1)}>
        <p className="text-sm text-ink">{meeting}</p>
      </ReviewBlock>
      <ReviewBlock
        title="Availability & pricing"
        complete={ready.length > 0}
        onEdit={() => onEdit(2)}
      >
        <p className="text-sm font-semibold text-ink">{optionScheduleCountLabel(option)}</p>
        {ready.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {ready.map((s, i) => (
              <li key={s.id} className="text-sm text-ink">
                {scheduleHeadlineName(s, i)}
                {' · '}
                {formatScheduleRange(s.availabilityDateFrom, s.availabilityDateTo)}
                {' · '}
                {s.startTime.trim()}
                {' · From '}
                {formatAmount(optionHeadlineUnitPrice(s))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">{priceSummary || 'Add a ready schedule'}</p>
        )}
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
