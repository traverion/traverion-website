type LegalLike = {
  operatorName: string;
  business_logo_url?: string | null;
  public_description?: string | null;
  privacy_policy_text?: string | null;
  terms_conditions_text?: string | null;
};

type Props = {
  heading: string;
  subtitle: string;
  supplier: LegalLike;
  onOpenLegal?: (kind: 'privacy' | 'terms') => void;
  /** Extra privacy note under the description (stays). */
  privacyNote?: string | null;
  className?: string;
};

/** Shared operator / host / provider profile chrome for consumer PDPs. */
export default function ListingPdpSupplierBlock({
  heading,
  subtitle,
  supplier,
  onOpenLegal,
  privacyNote = null,
  className = '',
}: Props) {
  const name = supplier.operatorName.trim();
  if (!name) return null;
  const description = supplier.public_description?.trim() || '';
  const hasPrivacy = Boolean(supplier.privacy_policy_text?.trim());
  const hasTerms = Boolean(supplier.terms_conditions_text?.trim());

  return (
    <section className={className}>
      <h2 className="tv-section-heading">{heading}</h2>
      <div className="mt-3 flex max-w-xl items-start gap-3.5">
        {supplier.business_logo_url ? (
          <img
            src={supplier.business_logo_url}
            alt=""
            className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-black/[0.06]"
          />
        ) : (
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0758CB]/10 text-sm font-bold text-[#0758CB]"
            aria-hidden
          >
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 pt-0.5">
          <p className="text-base font-bold tracking-tight text-[#111827]">{name}</p>
          <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>
        </div>
      </div>
      {description ? (
        <p className="mt-3.5 max-w-xl text-[15px] leading-relaxed text-ink-muted whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {description}
        </p>
      ) : null}
      {privacyNote?.trim() ? (
        <p className="mt-2 max-w-xl text-sm text-ink-muted">{privacyNote.trim()}</p>
      ) : null}
      {onOpenLegal && (hasPrivacy || hasTerms) ? (
        <div className="mt-3.5 flex flex-wrap gap-2">
          {hasPrivacy ? (
            <button type="button" onClick={() => onOpenLegal('privacy')} className="tv-btn-ghost">
              Privacy policy
            </button>
          ) : null}
          {hasTerms ? (
            <button type="button" onClick={() => onOpenLegal('terms')} className="tv-btn-ghost">
              Terms & conditions
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
