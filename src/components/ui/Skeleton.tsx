import { ReactNode } from 'react';

interface SkeletonProps {
  className?: string;
  /** Use default rounded block, or pass children for custom skeleton layout */
  children?: ReactNode;
}

/** Single line or block skeleton with pulse. */
export function Skeleton({ className = '', children }: SkeletonProps) {
  const base = 'bg-black/[0.06] rounded-lg animate-pulse';
  if (children) return <div className={`${base} ${className}`}>{children}</div>;
  return <div className={`h-4 ${base} ${className}`} />;
}

/** Card-shaped skeleton matching public tour cards (paper, no white border). */
export function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-xl bg-paper-raised shadow-soft ring-1 ring-black/[0.06]">
      <Skeleton className="aspect-[5/4] w-full rounded-none" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-7 w-20" />
      </div>
    </div>
  );
}

/** Grid of skeleton cards — matches marketplace browse density. */
export function SkeletonCardGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ animationDelay: `${i * 50}ms` }} className="animate-fade-in-up">
          <SkeletonCard />
        </div>
      ))}
    </div>
  );
}

/** Home “Places” photo tiles. */
export function SkeletonPlaceGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-56 sm:h-72 rounded-3xl" />
      ))}
    </div>
  );
}

/** Featured tour hero on Home. */
export function SkeletonFeaturedHero() {
  return <Skeleton className="w-full h-[22rem] sm:h-[28rem] rounded-3xl mb-6" />;
}

/** Page title + supporting line. */
export function SkeletonPageHero({ className = '' }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <div className="inline-flex items-center gap-2 rounded-lg bg-finland/10 px-2.5 py-1.5 ring-1 ring-finland/15 mb-3">
        <div className="h-4 w-4 rounded bg-finland/25 animate-pulse" />
        <div className="h-2.5 w-16 rounded bg-black/[0.06] animate-pulse" />
      </div>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-2 h-3.5 w-full max-w-md" />
    </div>
  );
}

/** Form field placeholders (account, password). */
export function SkeletonFormFields({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4 max-w-lg" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/** Inline list item skeleton (e.g. cart, wishlist, bookings). */
export function SkeletonListItem() {
  return (
    <div className="flex gap-4 py-4 animate-fade-in">
      <Skeleton className="h-20 w-20 rounded-xl flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-5 w-full max-w-xs" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    </div>
  );
}

/** Traveler hub while auth or list data is resolving. */
export function SkeletonConsumerPage({
  titleWidth = 'w-32',
  rows = 3,
  form = false,
}: {
  titleWidth?: string;
  rows?: number;
  form?: boolean;
}) {
  return (
    <div className="min-h-screen bg-paper tv-page">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8" aria-busy="true" aria-label="Loading">
        <Skeleton className={`h-8 ${titleWidth}`} />
        <Skeleton className="mt-2 h-3.5 w-64 max-w-full" />
        <div className="mt-6">
          {form ? (
            <SkeletonFormFields count={3} />
          ) : (
            <div className="divide-y divide-black/[0.04]">
              {Array.from({ length: rows }, (_, i) => (
                <SkeletonListItem key={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
