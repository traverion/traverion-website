import { identityPreviewSubtitle } from '../../../lib/listing-creation-scenes';

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
  const previewSubtitle = identityPreviewSubtitle(subtitle);
  const subtitleClamped = previewSubtitle !== subtitle.trim();

  return (
    <aside
      className="listing-creation-identity-preview lc-preview min-w-0 max-w-full overflow-hidden rounded-2xl px-5 py-5 sm:px-6 sm:py-6"
      aria-label="How travelers will see this name"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
        Travelers see
      </p>
      <p className="mt-3.5 break-words font-display text-[1.35rem] font-bold leading-[1.2] tracking-tight text-ink [overflow-wrap:anywhere] sm:text-[1.5rem]">
        {name}
      </p>
      {previewSubtitle ? (
        <p className="mt-2 line-clamp-4 break-words text-[14px] leading-relaxed text-ink-muted [overflow-wrap:anywhere]">
          {previewSubtitle}
        </p>
      ) : null}
      {languageLabel ? (
        <p className="mt-4 text-[12.5px] font-medium text-ink-muted">Spoken in {languageLabel}</p>
      ) : null}
      {subtitleClamped ? (
        <p className="mt-3 text-[11px] leading-snug text-ink-faint">
          Preview — the full subtitle is saved with the listing.
        </p>
      ) : null}
    </aside>
  );
}
