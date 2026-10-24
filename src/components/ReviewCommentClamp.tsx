/**
 * Public / partner review comment: ~3-line clamp with See more / See less.
 * Uses CSS line-clamp (not a character chop). Hidden when comment is empty.
 */
import { useLayoutEffect, useRef, useState } from 'react';

type Props = {
  text: string | null | undefined;
  className?: string;
  /** Button class for See more / See less */
  toggleClassName?: string;
};

export default function ReviewCommentClamp({
  text,
  className = 'text-sm leading-relaxed text-ink',
  toggleClassName = 'mt-1 text-[12.5px] font-semibold text-finland hover:underline',
}: Props) {
  const trimmed = (text ?? '').trim();
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    if (!trimmed) {
      setOverflows(false);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      if (expanded) return;
      setOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [trimmed, expanded]);

  if (!trimmed) return null;

  const showToggle = overflows || expanded;

  return (
    <div>
      <p
        ref={ref}
        className={`${className} break-words [overflow-wrap:anywhere] whitespace-pre-wrap ${
          expanded ? '' : 'line-clamp-3'
        }`}
      >
        {trimmed}
      </p>
      {showToggle ? (
        <button
          type="button"
          className={toggleClassName}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'See less' : 'See more'}
        </button>
      ) : null}
    </div>
  );
}
