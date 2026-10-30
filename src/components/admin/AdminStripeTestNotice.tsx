import NoticeCallout from '../NoticeCallout';
import {
  ADMIN_STRIPE_TEST_LABEL,
  ADMIN_STRIPE_TEST_NOTICE_BODY,
  ADMIN_STRIPE_TEST_NOTICE_TITLE,
  showAdminStripeTestDiagnostics,
} from '../../lib/traveler-env-presentation';

type Props = {
  /** `notice` = full callout. `chip` = compact sidebar badge. */
  variant?: 'notice' | 'chip';
  /** Optional body override for panel-specific diagnostics. */
  body?: string;
  className?: string;
};

/**
 * Internal Stripe TEST diagnostic. Hidden automatically when publishable key is live.
 */
export default function AdminStripeTestNotice({
  variant = 'notice',
  body = ADMIN_STRIPE_TEST_NOTICE_BODY,
  className,
}: Props) {
  if (!showAdminStripeTestDiagnostics()) return null;

  if (variant === 'chip') {
    return (
      <span
        className={
          className ??
          'inline-block mt-2 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-amber-100 text-amber-900'
        }
        role="status"
      >
        {ADMIN_STRIPE_TEST_LABEL}
      </span>
    );
  }

  return (
    <NoticeCallout title={ADMIN_STRIPE_TEST_NOTICE_TITLE} tone="warn" className={className}>
      {body}
    </NoticeCallout>
  );
}
