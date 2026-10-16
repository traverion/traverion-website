import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useDialogFocus } from '../hooks/useDialogFocus';
import TravelerAuthForm, { type TravelerAuthTab } from './auth/TravelerAuthForm';

export default function AuthModal() {
  const { authModalOpen, authIntent, closeAuthModal, triggerAuthSuccess } = useAuth();
  const [tab, setTab] = useState<TravelerAuthTab>('signin');
  const dialogRef = useRef<HTMLDivElement>(null);

  useDialogFocus(authModalOpen, dialogRef, closeAuthModal);

  useEffect(() => {
    if (!authModalOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [authModalOpen]);

  if (!authModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[30000] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={closeAuthModal}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="tv-auth-dialog w-full sm:max-w-[28.5rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex justify-end bg-white px-3 pt-3">
          <button
            type="button"
            onClick={closeAuthModal}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-black/[0.05] hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          <TravelerAuthForm
            idPrefix="auth-modal"
            tab={tab}
            onTabChange={setTab}
            intent={authIntent}
            afterConfirmNext="account"
            showPartnerLink
            onAuthenticated={() => {
              void triggerAuthSuccess();
            }}
          />
        </div>
      </div>
    </div>
  );
}
