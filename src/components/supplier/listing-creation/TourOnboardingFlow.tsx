/**
 * Focused Tour creation body — same shell pattern as Stay / Rental.
 * Basics and Information reuse existing guided components; Experience,
 * Options, Photos, and Preview are supplied by the parent so Tour
 * business logic (options workspace, photos, publish preview) stays intact.
 */

import type { ReactNode } from 'react';
import {
  TOUR_ONBOARDING_SCREENS,
  tourBasicsSceneIndexForScreen,
  tourInformationSceneIndexForScreen,
  type TourOnboardingScreenId,
} from '../../../lib/tour-onboarding';
import type { ListingCreationSceneDirection } from '../../../lib/listing-creation-scenes';
import { TourBasicsGuidedScenes } from './TourBasicsGuidedScenes';
import ListingInformationStage, { type ListingInformationFormSlice } from './ListingInformationStage';

type BasicsSlice = {
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

export type TourOnboardingFlowProps = {
  stage: number;
  direction: ListingCreationSceneDirection;
  attemptedContinue?: boolean;
  blocker?: string | null;
  basics: BasicsSlice;
  onBasicsChange: (patch: Partial<BasicsSlice>) => void;
  languageOptions: readonly { code: string; label: string }[];
  languageLabel: string | null;
  allowDirectSceneAccess?: boolean;
  information: ListingInformationFormSlice;
  onInformationChange: (patch: Partial<ListingInformationFormSlice>) => void;
  informationFarthestReached: number;
  phoneError?: string | null;
  /** Experience / Options / Photos / Preview panels from SupplierListingForm. */
  extraPanel: ReactNode;
};

export default function TourOnboardingFlow(props: TourOnboardingFlowProps) {
  const screen = TOUR_ONBOARDING_SCREENS[props.stage] ?? TOUR_ONBOARDING_SCREENS[0];
  const id: TourOnboardingScreenId = screen.id;
  const basicsScene = tourBasicsSceneIndexForScreen(id);
  const infoScene = tourInformationSceneIndexForScreen(id);

  const wide =
    id === 'options' || id === 'photos' || id === 'preview' || id === 'experience';

  let body: ReactNode = null;

  if (basicsScene != null) {
    body = (
      <TourBasicsGuidedScenes
        form={props.basics}
        sceneIndex={basicsScene}
        direction={props.direction}
        languageOptions={props.languageOptions}
        languageLabel={props.languageLabel}
        allowDirectSceneAccess={props.allowDirectSceneAccess}
        hideProgress="all"
        onSelectScene={() => {
          /* Footer owns navigation in focused mode. */
        }}
        onChange={props.onBasicsChange}
      />
    );
  } else if (infoScene != null) {
    body = (
      <ListingInformationStage
        form={props.information}
        onChange={props.onInformationChange}
        sceneIndex={infoScene}
        direction={props.direction}
        farthestReached={props.informationFarthestReached}
        allowDirectSceneAccess={props.allowDirectSceneAccess}
        hideProgress="all"
        onSelectScene={() => {
          /* Footer owns navigation in focused mode. */
        }}
        phoneError={props.phoneError}
        businessCountry={props.basics.country}
        showPhoneRequired
      />
    );
  } else if (id === 'experience') {
    body = (
      <div className="tour-onboarding-experience space-y-3">
        <header className="mb-5 max-w-[40rem] space-y-2 sm:mb-6">
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
            {screen.group} · {screen.part}
          </p>
          <h3 className="font-display text-[1.45rem] font-bold leading-[1.15] tracking-tight text-ink sm:text-[1.7rem]">
            {screen.title}
          </h3>
          <p className="text-[14px] leading-relaxed text-ink-muted sm:text-[15px]">{screen.body}</p>
        </header>
        {props.extraPanel}
      </div>
    );
  } else {
    body = props.extraPanel;
  }

  return (
    <div
      className={`tour-creator stay-creator mx-auto w-full ${wide ? 'max-w-[72rem]' : 'max-w-[52rem]'}`}
      data-tour-screen={id}
    >
      {body}
      {props.attemptedContinue && props.blocker ? (
        <p className="mt-4 text-sm font-medium text-amber-900" role="status">
          {props.blocker}
        </p>
      ) : null}
    </div>
  );
}
