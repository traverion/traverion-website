import type { ReactNode, Ref } from 'react';
import type { ListingCreationSceneDirection } from '../../../lib/listing-creation-scenes';
import { ListingCreationSceneProgress } from './ListingCreationSceneProgress';

export function ListingCreationSceneFrame({
  question,
  support,
  sceneIndex,
  sceneTotal,
  sceneLabels,
  sceneProgressAriaLabel,
  canSelectScene,
  isSceneComplete,
  onSelectScene,
  direction,
  headingRef,
  headingId,
  children,
}: {
  question: string;
  support: string;
  sceneIndex: number;
  sceneTotal: number;
  sceneLabels: readonly string[];
  sceneProgressAriaLabel: string;
  canSelectScene?: (index: number) => boolean;
  /** Derived from real readiness, not visitation. */
  isSceneComplete?: (index: number) => boolean;
  onSelectScene?: (index: number) => void;
  direction: ListingCreationSceneDirection;
  headingRef?: Ref<HTMLHeadingElement>;
  headingId: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`listing-creation-scene listing-creation-scene--${direction} w-full`}
    >
      <header className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
        <div className="min-w-0 max-w-xl">
          <h3
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="text-[1.15rem] font-semibold leading-[1.25] tracking-tight text-ink outline-none sm:text-[1.25rem]"
          >
            {question}
          </h3>
          <p className="mt-1 text-[13px] leading-snug text-ink-muted">{support}</p>
        </div>
        <ListingCreationSceneProgress
          index={sceneIndex}
          total={sceneTotal}
          labels={sceneLabels}
          ariaLabel={sceneProgressAriaLabel}
          canSelect={canSelectScene}
          isComplete={isSceneComplete}
          onSelect={onSelectScene}
        />
      </header>
      {children}
    </div>
  );
}
