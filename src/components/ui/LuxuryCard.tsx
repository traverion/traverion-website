import { ReactNode } from 'react';

interface LuxuryCardProps {
  children: ReactNode;
  variant?: 'default' | 'glass' | 'gradient' | 'elevated';
  hover?: boolean;
  className?: string;
}

export default function LuxuryCard({
  children,
  variant = 'default',
  hover = true,
  className = '',
}: LuxuryCardProps) {
  const baseClasses = 'rounded-2xl transition-shadow duration-500 ease-lux';

  const variants = {
    default: 'bg-white shadow-lg hover:shadow-2xl',
    glass: 'glass backdrop-blur-lg bg-white/10 border border-white/20',
    gradient: 'bg-gradient-to-br from-white to-gray-50 shadow-xl hover:shadow-2xl',
    elevated: 'bg-white shadow-2xl hover:shadow-3xl',
  };

  const hoverClasses = hover ? 'lux-card-surface' : '';

  return (
    <div className={`${baseClasses} ${variants[variant]} ${hoverClasses} ${className}`}>
      {children}
    </div>
  );
}
