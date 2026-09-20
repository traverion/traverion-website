export function ListingCreationIdentityPreview({
  title,
  subtitle,
  languageLabel,
}: {
  title: string;
  subtitle: string;
  languageLabel: string | null;
}) {
  const name = title.trim();
  if (!name) return null;

  return (
    <aside
      className="listing-creation-identity-preview rounded-2xl border border-black/[0.06] bg-paper-raised px-5 py-5"
      aria-label="How travelers will see this name"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Travelers see</p>
      <p className="mt-3 font-display text-xl leading-snug tracking-tight text-ink">{name}</p>
      {subtitle.trim() ? (
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{subtitle.trim()}</p>
      ) : null}
      {languageLabel ? (
        <p className="mt-4 text-xs text-ink-muted">Spoken in {languageLabel}</p>
      ) : null}
    </aside>
  );
}
