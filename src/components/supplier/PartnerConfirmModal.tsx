import ConfirmDialog from '../feedback/ConfirmDialog';

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

/** Partner alias for the shared confirmation dialog. */
export default function PartnerConfirmModal(props: Props) {
  return <ConfirmDialog {...props} />;
}
