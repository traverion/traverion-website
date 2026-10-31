/**
 * Mission 05.6.2 — Compact centered modal shell (bulk edit).
 */
import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'default' | 'wide';
  'aria-label'?: string;
};

export default function PartnerUnifiedCalendarDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = 'default',
  'aria-label': ariaLabel,
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus();
    }, 40);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="partner-unified-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="partner-unified-modal__backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`partner-unified-modal__panel${
          size === 'wide' ? ' partner-unified-modal__panel--wide' : ''
        }`}
      >
        <header className="partner-unified-modal__head">
          <div className="min-w-0">
            {subtitle ? <p className="partner-unified-modal__eyebrow">{subtitle}</p> : null}
            <h2 id={titleId} className="partner-unified-modal__title">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="partner-unified-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        <div className="partner-unified-modal__body">{children}</div>
        {footer ? <footer className="partner-unified-modal__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}
