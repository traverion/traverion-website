import type { ReactNode, Ref } from 'react';
import type { ListingCreationSceneDirection } from '../../../lib/listing-creation-scenes';
import { ListingCreationSceneProgress } from './ListingCreationSceneProgress';

/**
 * Guided scene chrome for Basics / Information / Options.
 * Progress sits above the question so labels stay fully readable on desktop.
 */
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
    <div className={`listing-creation-scene listing-creation-scene--${direction} w-full`}>
      <header className="mb-6 space-y-4 sm:mb-7">
        <ListingCreationSceneProgress
          index={sceneIndex}
          total={sceneTotal}
          labels={sceneLabels}
          ariaLabel={sceneProgressAriaLabel}
          canSelect={canSelectScene}
          isComplete={isSceneComplete}
          onSelect={onSelectScene}
        />
        <div className="max-w-[46rem]">
          <h3
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="font-display text-[1.35rem] font-bold leading-[1.2] tracking-tight text-ink outline-none sm:text-[1.5rem]"
          >
            {question}
          </h3>
          {support.trim() ? (
            <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-muted">{support}</p>
          ) : null}
        </div>
      </header>
      {children}
    </div>
  );
}
