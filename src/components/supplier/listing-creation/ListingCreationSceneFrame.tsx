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
  /** Options editor uses denser headings to match the full-screen compact chrome. */
  density = 'default',
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
  density?: 'default' | 'compact';
  children: ReactNode;
}) {
  const compact = density === 'compact';
  return (
    <div className={`listing-creation-scene listing-creation-scene--${direction} w-full`}>
      <header className={compact ? 'mb-4 space-y-3' : 'mb-5 space-y-3.5 sm:mb-6 sm:space-y-4'}>
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
            className={
              compact
                ? 'text-[1.125rem] font-semibold leading-snug tracking-tight text-ink outline-none sm:text-[1.2rem]'
                : 'font-display text-[1.3rem] font-bold leading-[1.2] tracking-tight text-ink outline-none sm:text-[1.45rem]'
            }
          >
            {question}
          </h3>
          {support.trim() ? (
            <p
              className={
                compact
                  ? 'mt-1 max-w-xl text-[12.5px] leading-snug text-ink-muted'
                  : 'mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-ink-muted sm:text-[14px]'
              }
            >
              {support}
            </p>
          ) : null}
        </div>
      </header>
      {children}
    </div>
  );
}
