import { CHECKOUT_CONSENT_LABEL } from '../../lib/checkout-consent';

type Props = {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  className?: string;
};

/** Required acknowledgment before Stripe TEST redirect (tour + stay checkout). */
export default function CheckoutConsentCheckbox({ id, checked, onChange, className }: Props) {
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-3 rounded-xl bg-paper px-3 py-3 ring-1 ring-black/[0.05] cursor-pointer ${className ?? ''}`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 rounded border-black/20 text-finland focus:ring-finland"
      />
      <span className="text-sm text-ink leading-relaxed">
        {CHECKOUT_CONSENT_LABEL}{' '}
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-finland underline-offset-2 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Open Terms
        </a>
      </span>
    </label>
  );
}
