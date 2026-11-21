import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { sanitizeTravelerAuthNext } from '../lib/travelerAuthLinks';
import {
  armTravelerToast,
  subscribeTravelerToast,
  takeTravelerToast,
  type ArmedTravelerToast,
  type TravelerToastCopy,
} from '../lib/traveler-toast';

type VisibleToast = ArmedTravelerToast & TravelerToastCopy;

const VISIBLE_MS = 3600;
const EXIT_MS = 200;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function ToastCard({ toast, onDone }: { toast: VisibleToast; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setLeaving(true), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(onDone, prefersReducedMotion() ? 0 : EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, onDone]);

  return (
    <div className={`tv-toast${leaving ? ' tv-toast--out' : ''}`} role="status">
      <span className="tv-toast__mark" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="tv-toast__title">{toast.title}</p>
        <p className="tv-toast__message">{toast.message}</p>
      </div>
      <button type="button" className="tv-toast__dismiss" aria-label="Dismiss" onClick={() => setLeaving(true)}>
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/**
 * One traveler toast. It appears only after the armed page is the page on screen.
 */
export default function TravelerToastHost({ page }: { page: string }) {
  const { user, loading } = useAuth();
  const [toast, setToast] = useState<VisibleToast | null>(null);

  useEffect(() => {
    const show = () => {
      const next = takeTravelerToast(page);
      if (!next) return;
      setToast((current) => (current?.id === next.id ? current : next));
    };
    show();
    return subscribeTravelerToast(show);
  }, [page]);

  useEffect(() => {
    if (loading || !user?.email_confirmed_at) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('via') !== 'link') return;
    params.delete('via');
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    const destination =
      path === '/log-in' || path === '/login' || path === '/sign-up' || path === '/auth'
        ? sanitizeTravelerAuthNext(params.get('next'))
        : page;
    armTravelerToast('login', destination);
  }, [loading, user, page]);

  return (
    <div className="tv-toast-viewport" aria-live="polite" aria-atomic="true">
      {toast ? <ToastCard key={toast.id} toast={toast} onDone={() => setToast(null)} /> : null}
    </div>
  );
}
