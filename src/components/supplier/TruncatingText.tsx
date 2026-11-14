/**
 * Shows a native title tooltip only when the text is visually truncated.
 */
import { useLayoutEffect, useRef, useState, type HTMLAttributes } from 'react';

type Props = {
  text: string;
  as?: 'span' | 'p';
  className?: string;
} & Omit<HTMLAttributes<HTMLElement>, 'title' | 'children' | 'className'>;

export default function TruncatingText({ text, as = 'span', className, ...rest }: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [title, setTitle] = useState<string | undefined>(undefined);
  const Tag = as;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      setTitle(undefined);
      return;
    }

    const sync = () => {
      const truncated = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
      setTitle(truncated ? text : undefined);
    };

    sync();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- polymorphic span|p ref
      ref={ref as any}
      className={className}
      title={title}
      {...rest}
    >
      {text}
    </Tag>
  );
}
