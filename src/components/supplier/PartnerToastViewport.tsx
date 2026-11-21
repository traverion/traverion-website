import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, Check } from 'lucide-react';
import {
  dismissPartnerToast,
  subscribePartnerToasts,
  toastDuration,
  type PartnerToast,
} from '../../lib/partner-toast';

function ToastCard({ toast }: { toast: PartnerToast }) {
  const [leaving, setLeaving] = useState(false);
  const remaining = useRef(toastDuration(toast.tone));
  const paused = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (paused.current || leaving) return;
      remaining.current -= 100;
      if (remaining.current <= 0) setLeaving(true);
    }, 100);
    return () => window.clearInterval(timer);
  }, [leaving]);

  useEffect(() => {
    if (!leaving) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => dismissPartnerToast(toast.id), reduced ? 0 : 280);
    return () => window.clearTimeout(timer);
  }, [leaving, toast.id]);

  const pause = () => {
    paused.current = true;
  };
  const resume = () => {
    paused.current = false;
  };

  return (
    <div
      className={`partner-toast partner-toast--${toast.tone}${leaving ? ' partner-toast--out' : ' partner-toast--in'}`}
      role="status"
      tabIndex={0}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      {toast.tone === 'error' ? (
        <AlertCircle className="partner-toast__icon" aria-hidden />
      ) : toast.tone === 'warning' ? (
        <AlertTriangle className="partner-toast__icon" aria-hidden />
      ) : toast.tone === 'success' ? (
        <Check className="partner-toast__icon" aria-hidden />
      ) : (
        <span className="partner-toast__dot" aria-hidden />
      )}
      <p className="partner-toast__message">{toast.message}</p>
      {toast.tone === 'error' || toast.tone === 'warning' ? (
        <button type="button" className="partner-toast__dismiss" onClick={() => setLeaving(true)}>
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

export default function PartnerToastViewport() {
  const [toasts, setToasts] = useState<PartnerToast[]>([]);
  useEffect(() => subscribePartnerToasts(setToasts), []);
  if (typeof document === 'undefined' || toasts.length === 0) return null;
  return createPortal(
    <div className="partner-toast-viewport" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>,
    document.body
  );
}
