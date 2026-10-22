import { ReactNode } from 'react';

interface LuxuryCardProps {
  children: ReactNode;
  variant?: 'default' | 'glass' | 'gradient' | 'elevated';
  hover?: boolean;
  className?: string;
}

/**
 * Lightweight elevated surface — uses shared --tv-elev tokens.
 * Prefer PublicListingBrowseCard / tv-browse-card for marketplace listings.
 */
export default function LuxuryCard({
  children,
  variant = 'default',
  hover = true,
  className = '',
}: LuxuryCardProps) {
  const baseClasses =
    'rounded-[var(--tv-radius-lg,1rem)] transition-[box-shadow,transform] duration-[var(--tv-duration-ui,200ms)] ease-[var(--tv-ease)]';

  const variants = {
    default: 'bg-white shadow-[var(--tv-elev-1)]',
    glass: 'bg-white/80 backdrop-blur-md border border-white/30 shadow-[var(--tv-elev-2)]',
    gradient: 'bg-white shadow-[var(--tv-elev-2)]',
    elevated: 'bg-white shadow-[var(--tv-elev-3)]',
  };

  const hoverClasses = hover
    ? 'motion-safe:hover:shadow-[var(--tv-shadow-hover)] motion-safe:hover:-translate-y-0.5'
    : '';

  return (
    <div className={`${baseClasses} ${variants[variant]} ${hoverClasses} ${className}`}>
      {children}
    </div>
  );
}
