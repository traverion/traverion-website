type Props = {
  saving?: boolean;
  savedAt?: number | null;
};

/** Quiet autosave status. It reports a save that already finished. */
export default function SavedIndicator({ saving = false, savedAt = null }: Props) {
  if (!saving && !savedAt) return null;
  const label = saving
    ? 'Saving'
    : `Saved ${new Date(savedAt as number).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return (
    <span className="tv-saved-indicator" role="status">
      {label}
    </span>
  );
}
