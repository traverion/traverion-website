import { ReactNode } from 'react';

interface SkeletonProps {
  className?: string;
  /** Use default rounded block, or pass children for custom skeleton layout */
  children?: ReactNode;
}

/** Single line or block skeleton with pulse. */
export function Skeleton({ className = '', children }: SkeletonProps) {
  const base = 'bg-gray-200 rounded animate-pulse';
  if (children) return <div className={`${base} ${className}`}>{children}</div>;
  return <div className={`h-4 ${base} ${className}`} />;
}

/** Card-shaped skeleton for tour/listing cards. */
export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-fade-in-up">
      <Skeleton className="h-48 w-full rounded-none" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <Skeleton className="h-8 w-24 mt-4" />
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

/** Inline list item skeleton (e.g. cart, wishlist, bookings). */
export function SkeletonListItem() {
  return (
    <div className="flex gap-4 p-4 rounded-xl border border-gray-200 bg-white animate-fade-in">
      <Skeleton className="h-24 w-24 rounded-lg flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-5 w-full max-w-xs" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    </div>
  );
}
