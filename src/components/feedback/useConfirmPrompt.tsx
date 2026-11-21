import { useCallback, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

type AskInput = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
};

type Request = AskInput & {
  resolve: (ok: boolean) => void;
};

/** Opens the shared confirmation dialog and resolves when the person chooses. */
export function useConfirmPrompt() {
  const [request, setRequest] = useState<Request | null>(null);
  const open = useRef(false);

  const ask = useCallback((input: AskInput) => {
    if (open.current) return Promise.resolve(false);
    open.current = true;
    return new Promise<boolean>((resolve) => {
      setRequest({
        ...input,
        resolve: (ok) => {
          open.current = false;
          resolve(ok);
        },
      });
    });
  }, []);

  const settle = (ok: boolean) => {
    setRequest((current) => {
      current?.resolve(ok);
      return null;
    });
  };

  const dialog = (
    <ConfirmDialog
      open={request != null}
      title={request?.title ?? ''}
      description={request?.description ?? ''}
      confirmLabel={request?.confirmLabel ?? 'Continue'}
      destructive={Boolean(request?.destructive)}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { ask, dialog };
}
