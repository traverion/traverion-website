import type { ReactNode, Ref } from 'react';
import type { ListingCreationSceneDirection } from '../../../lib/listing-creation-scenes';
import { ListingCreationSceneProgress } from './ListingCreationSceneProgress';

export function ListingCreationSceneFrame({
  question,
  support,
  sceneIndex,
  sceneTotal,
  sceneLabels,
  canSelectScene,
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
  canSelectScene?: (index: number) => boolean;
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
      <header className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 max-w-xl">
          <h3
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="font-display text-[2rem] font-bold leading-[1.12] tracking-tight text-ink outline-none sm:text-[2.4rem]"
          >
            {question}
          </h3>
          <p className="mt-2 max-w-md text-base leading-relaxed text-ink-muted">{support}</p>
        </div>
        <ListingCreationSceneProgress
          index={sceneIndex}
          total={sceneTotal}
          labels={sceneLabels}
          canSelect={canSelectScene}
          onSelect={onSelectScene}
        />
      </header>
      {children}
    </div>
  );
}
