import type { ReactNode } from 'react';

export function StayChoice({
  pressed,
  onClick,
  children,
  className = '',
  disabled = false,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`stay-choice lc-choice flex min-h-11 w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-45 ${pressed ? 'lc-choice--selected text-[#073b83]' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

export function StayField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="stay-field block">
      <span>{label}</span>
      <div className="mt-1.5 font-normal">{children}</div>
    </label>
  );
}

export function StayHelp({ children }: { children: ReactNode }) {
  return <p className="stay-help">{children}</p>;
}
