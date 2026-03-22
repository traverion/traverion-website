import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface LuxuryButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'gradient';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

export default function LuxuryButton({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  onClick,
  className = '',
  type = 'button',
}: LuxuryButtonProps) {
  const baseClasses =
    'relative inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-300 ease-lux focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-finland text-white hover:bg-finland-dark focus:ring-finland shadow-soft hover:shadow-soft-lg',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-500 shadow-soft hover:shadow-soft-lg',
    outline: 'border-2 border-finland text-finland hover:bg-finland hover:text-white focus:ring-finland',
    ghost: 'text-finland hover:bg-finland/10 focus:ring-finland',
    gradient: 'bg-finland text-white hover:bg-finland-dark focus:ring-finland shadow-soft hover:shadow-soft-lg',
  };

  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
    xl: 'px-10 py-5 text-xl',
  };

  const luxuryClasses = 'btn-luxury overflow-hidden';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${luxuryClasses} ${className}`}
    >
      {loading && (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      )}
      {children}
    </button>
  );
}
