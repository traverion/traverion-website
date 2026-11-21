type Props = {
  children?: string | null;
};

/** Field-level error announced to assistive tech. */
export default function InlineError({ children }: Props) {
  const text = (children ?? '').trim();
  if (!text) return null;
  return (
    <p className="tv-inline-error" role="alert">
      {text}
    </p>
  );
}
