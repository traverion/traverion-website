type Props = {
  onResend: () => void;
  sending: boolean;
  remainingMs: number;
};

export default function UnverifiedLoginNotice({ onResend, sending, remainingMs }: Props) {
  const seconds = Math.ceil(remainingMs / 1000);
  return (
    <div className="rounded-xl bg-[#f4f7fb] px-3.5 py-3 text-sm text-ink" role="alert">
      <p className="font-semibold text-ink">Email not verified</p>
      <p className="mt-1 leading-relaxed text-ink-muted">Please confirm your email address before logging in.</p>
      <button
        type="button"
        className="mt-2 text-sm font-semibold text-finland hover:underline disabled:opacity-50"
        disabled={sending || remainingMs > 0}
        onClick={onResend}
      >
        {sending ? 'Requesting…' : 'Resend confirmation email'}
      </button>
      {remainingMs > 0 ? (
        <p className="mt-1 text-xs text-ink-muted">You can request another email in {seconds}s.</p>
      ) : null}
    </div>
  );
}
