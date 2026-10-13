import { useEffect, useRef } from 'react';
import { isTourOptionSceneSatisfied } from '../../../lib/listing-option-progression';
import { ListingCreationSceneFrame } from './ListingCreationSceneFrame';
import { TourOptionScheduleList } from './TourOptionScheduleList';
import BookingOptionEditor from '../BookingOptionEditor';
import {
  TOUR_OPTION_SCENE_COUNT,
  TOUR_OPTION_SCENES,
  type TourOptionSceneId,
} from '../../../lib/listing-option-scenes';
import type { ListingCreationSceneDirection } from '../../../lib/listing-creation-scenes';
import type { ListingBookingOption, ListingOptionSchedule } from '../../../types/listingExtras';

/** Short support under the scene question — keep empty when the editor fields are self-explanatory. */
const SUPPORT: Record<TourOptionSceneId, string> = {
  setup: '',
  meeting: '',
  pricing: 'Set prices and capacity when adding a schedule.',
  availability: '',
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
  priceSummary: _priceSummary,
  validationMessages: _validationMessages,
  attempted,
  onAddSchedule,
  onEditSchedule,
  onDuplicateSchedule,
  onDeleteSchedule,
  pendingScheduleDeleteId,
  onCancelScheduleDelete,
  occupancyNoticeForSchedule,
  listingDepartureTimezone,
  onListingDepartureTimezoneChange,
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
  listingDepartureTimezone?: string;
  onListingDepartureTimezoneChange?: (timezone: string) => void;
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
      density="compact"
    >
      {scene.id === 'availability' ? (
        <div className="space-y-7">
          <section className="space-y-2.5" aria-labelledby="option-schedules-heading">
            <h4 id="option-schedules-heading" className="text-[13px] font-semibold text-ink">
              Schedules
            </h4>
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
          </section>
          <section className="space-y-2.5" aria-labelledby="option-booking-settings-heading">
            <h4 id="option-booking-settings-heading" className="text-[13px] font-semibold text-ink">
              Booking settings
            </h4>
            <BookingOptionEditor
              option={option}
              currencyLabel={currencyLabel}
              hasEndingDate={hasEndingDate}
              onHasEndingDateChange={onHasEndingDateChange}
              onChange={onChange}
              activeSection="booking_window"
              attempted={attempted}
              listingDepartureTimezone={listingDepartureTimezone}
              onListingDepartureTimezoneChange={onListingDepartureTimezoneChange}
            />
          </section>
        </div>
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
