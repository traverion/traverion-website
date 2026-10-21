import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { SUPPLIER_MODAL_OVERLAY_CLASS, SUPPLIER_MODAL_PANEL_CLASS } from './supplierUi';

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Traverion confirmation dialog for partner destructive / irreversible actions. */
export default function PartnerConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, panelRef, () => {
    if (!busy) onCancel();
  });

  if (!open) return null;

  return createPortal(
    <div className={`${SUPPLIER_MODAL_OVERLAY_CLASS} z-[100]`}>
      <button type="button" tabIndex={-1} className="absolute inset-0" aria-label="Close" onClick={() => !busy && onCancel()} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="partner-confirm-title"
        className={`${SUPPLIER_MODAL_PANEL_CLASS} z-[101] mx-auto w-full max-w-[26rem] p-5 sm:p-6`}
      >
        <h2 id="partner-confirm-title" className="text-[17px] font-semibold tracking-tight text-[#18181b]">
          {title}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[#52525b]">{description}</p>
        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-900 ring-1 ring-red-200/80" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="tv-btn-ghost inline-flex h-10 items-center justify-center px-3 text-[13px]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={
              destructive
                ? 'inline-flex h-10 items-center justify-center rounded-lg bg-[#b91c1c] px-3 text-[13px] font-semibold text-white hover:bg-[#991b1b] disabled:opacity-60'
                : 'tv-btn-primary inline-flex h-10 items-center justify-center px-3 text-[13px]'
            }
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
