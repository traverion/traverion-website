import type { ReactNode } from 'react';

export function MarketplaceFilterSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{title}</h3>
        {hint ? <p className="mt-1 text-xs text-ink-faint leading-snug">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function MarketplaceFilterChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`tv-chip min-h-9 px-3 py-1.5 text-[13px] transition-colors duration-150 ${
        pressed
          ? 'bg-finland text-white shadow-sm ring-2 ring-finland/40'
          : 'bg-paper text-ink ring-1 ring-black/[0.06] hover:bg-finland/10 hover:text-finland'
      }`}
    >
      {children}
    </button>
  );
}

export function MarketplaceFilterChipRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

export function MarketplaceActiveChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="lux-flat inline-flex items-center gap-1.5 rounded-full bg-finland/10 px-3 py-1.5 text-xs font-semibold text-finland ring-1 ring-finland/20"
    >
      {label}
      <span aria-hidden className="text-finland/70">
        ×
      </span>
    </button>
  );
}
