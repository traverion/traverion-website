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
    <div className="bg-paper-raised rounded-2xl overflow-hidden">
      <Skeleton className="h-56 sm:h-64 w-full rounded-none" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-8 w-24" />
      </div>
    </div>
  );
}

/** Grid of skeleton cards. */
export function SkeletonCardGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
      <Skeleton className="h-10 w-48" />
      <Skeleton className="mt-3 h-4 w-full max-w-md" />
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
    <div className="min-h-screen bg-paper pt-20">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12" aria-busy="true" aria-label="Loading">
        <Skeleton className={`h-10 ${titleWidth}`} />
        <Skeleton className="mt-3 h-4 w-64 max-w-full" />
        <div className="mt-10">
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
