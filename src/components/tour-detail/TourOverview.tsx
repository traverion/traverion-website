import ListingPdpCollapsible from '../ListingPdpCollapsible';

type Props = {
  description: string;
  extras?: string[];
};

export default function TourOverview({ description, extras = [] }: Props) {
  const text = description.trim();
  if (!text && extras.length === 0) return null;
  return (
    <section className="tv-pdp-section">
      <h2 className="tv-section-heading">What you’ll do</h2>
      {text ? (
        <ListingPdpCollapsible textForLength={text} collapseAtChars={420}>
          <p
            id="tour-overview-description"
            className="max-w-xl text-[15px] leading-[1.65] text-[#273244] break-words [overflow-wrap:anywhere] whitespace-pre-wrap"
          >
            {text}
          </p>
        </ListingPdpCollapsible>
      ) : null}
      {extras.length > 0 ? (
        <ul className="mt-4 max-w-xl space-y-1.5 text-sm leading-relaxed text-[#273244]">
          {extras.map((line) => (
            <li key={line} className="break-words [overflow-wrap:anywhere]">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
