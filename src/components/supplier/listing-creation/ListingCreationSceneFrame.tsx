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
  /** When the option shell has a left step rail, hide the duplicate horizontal progress on desktop. */
  hideProgress = false,
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
  hideProgress?: boolean;
  children: ReactNode;
}) {
  const compact = density === 'compact';
  return (
    <div className={`listing-creation-scene listing-creation-scene--${direction} w-full`}>
      <header className={compact ? 'mb-5 space-y-3' : 'mb-6 space-y-3.5 sm:mb-7 sm:space-y-4'}>
        {hideProgress ? (
          <div className="lg:hidden">
            <ListingCreationSceneProgress
              index={sceneIndex}
              total={sceneTotal}
              labels={sceneLabels}
              ariaLabel={sceneProgressAriaLabel}
              canSelect={canSelectScene}
              isComplete={isSceneComplete}
              onSelect={onSelectScene}
            />
          </div>
        ) : (
          <ListingCreationSceneProgress
            index={sceneIndex}
            total={sceneTotal}
            labels={sceneLabels}
            ariaLabel={sceneProgressAriaLabel}
            canSelect={canSelectScene}
            isComplete={isSceneComplete}
            onSelect={onSelectScene}
          />
        )}
        <div className={compact ? 'max-w-[56rem]' : 'max-w-[40rem]'}>
          <h3
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className={
              compact
                ? 'text-[1.2rem] font-semibold leading-snug tracking-tight text-ink outline-none focus:outline-none sm:text-[1.3rem]'
                : 'font-display text-[1.45rem] font-bold leading-[1.15] tracking-tight text-ink outline-none focus:outline-none sm:text-[1.7rem]'
            }
          >
            {question}
          </h3>
          {support.trim() ? (
            <p
              className={
                compact
                  ? 'mt-1.5 max-w-lg text-[13px] leading-snug text-ink-muted'
                  : 'mt-2 max-w-lg text-[14px] leading-relaxed text-ink-muted sm:text-[15px]'
              }
            >
              {support}
            </p>
          ) : null}
        </div>
      </header>
      <div className="listing-creation-scene__body">{children}</div>
    </div>
  );
}
