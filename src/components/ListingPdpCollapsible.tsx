import { useId, useState, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Characters / approximate length gate when `collapseAt` is not set via maxHeight alone. */
  collapseAtChars?: number;
  textForLength?: string;
  collapsedMaxHeightClass?: string;
  className?: string;
  moreLabel?: string;
  lessLabel?: string;
};

/**
 * Progressive disclosure for long PDP copy — keeps SEO content in the DOM when expanded.
 */
export default function ListingPdpCollapsible({
  children,
  collapseAtChars = 420,
  textForLength = '',
  collapsedMaxHeightClass = 'max-h-[14rem]',
  className = '',
  moreLabel = 'Show more',
  lessLabel = 'Show less',
}: Props) {
  const id = useId();
  const long = textForLength.trim().length > collapseAtChars;
  const [open, setOpen] = useState(false);
  if (!long) {
    return <div className={className}>{children}</div>;
  }
  return (
    <div className={className}>
      <div
        id={id}
        className={
          open
            ? undefined
            : `${collapsedMaxHeightClass} overflow-hidden [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]`
        }
      >
        {children}
      </div>
      <button
        type="button"
        className="mt-2.5 text-sm font-semibold text-[#0758CB] hover:underline"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? lessLabel : moreLabel}
      </button>
    </div>
  );
}
