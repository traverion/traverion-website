import { Check } from 'lucide-react';

type Props = {
  items: string[];
  className?: string;
  /** Use a single column (e.g. short rental highlight lists). */
  singleColumn?: boolean;
};

/** Tour-style checkmark feature list for highlights / amenities / rules. */
export default function ListingPdpCheckList({ items, className = '', singleColumn = false }: Props) {
  const lines = items.map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <ul
      className={`${
        singleColumn ? 'grid grid-cols-1 gap-2.5' : 'grid grid-cols-1 gap-2.5 sm:grid-cols-2'
      } ${className}`.trim()}
    >
      {lines.map((line) => (
        <li key={line} className="flex items-start gap-2.5 text-[15px] font-medium text-[#111827]">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EAF2FF] text-[#0758CB]">
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </span>
          <span className="break-words [overflow-wrap:anywhere]">{line}</span>
        </li>
      ))}
    </ul>
  );
}
