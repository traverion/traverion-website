import { useState, forwardRef } from 'react';
import { Eye, EyeOff, Search, X } from 'lucide-react';

interface LuxuryInputProps {
  type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'number';
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear?: () => void;
  disabled?: boolean;
  error?: string;
  label?: string;
  icon?: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const LuxuryInput = forwardRef<HTMLInputElement, LuxuryInputProps>(({
  type = 'text',
  placeholder,
  value,
  onChange,
  onClear,
  disabled = false,
  error,
  label,
  icon,
  className = '',
  size = 'md',
}, ref) => {
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const inputType = type === 'password' && showPassword ? 'text' : type;
  
  const baseClasses = 'w-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent';
  
  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-3 text-base',
    lg: 'px-5 py-4 text-lg',
  };

  const containerClasses = `
    relative group
    ${error ? 'border-red-500' : isFocused ? 'border-sky-500' : 'border-gray-300'}
    ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-sky-400'}
  `;

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <label className="block text-sm font-semibold text-gray-700">
          {label}
        </label>
      )}
      
      <div className={`relative border rounded-xl ${containerClasses}`}>
        {icon && (
          <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-sky-500 transition-colors">
            {icon}
          </div>
        )}
        
        <input
          ref={ref}
          type={inputType}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={`
            ${baseClasses}
            ${sizeClasses[size]}
            ${icon ? 'pl-12' : 'pl-4'}
            ${type === 'password' || onClear ? 'pr-12' : 'pr-4'}
            bg-transparent
            placeholder-gray-400
            text-gray-900
          `}
        />
        
        {type === 'password' && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        )}
        
        {type === 'search' && value && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        )}
        
        {type === 'search' && !icon && (
          <Search className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
        )}
      </div>
      
      {error && (
        <p className="text-sm text-red-500 animate-fade-in-up">{error}</p>
      )}
    </div>
  );
});

LuxuryInput.displayName = 'LuxuryInput';

export default LuxuryInput;
