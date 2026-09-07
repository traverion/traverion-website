import LegalPageShell from '../components/LegalPageShell';

/** Route kept for old links; Traverion is not publishing editorial stories yet. */
export default function Blog({ onNavigate }: { onNavigate?: (page: string) => void }) {
  return (
    <LegalPageShell
      title="Stories coming later"
      subtitle="We are not publishing travel articles yet. Browse live tours instead."
      onNavigate={onNavigate}
    >
      <p>
        Destination guides will return when we have real operator stories worth sharing. Until then, the
        marketplace is the product.
      </p>
      <p className="mt-6">
        <a href="/packages" className="tv-btn-primary inline-flex">
          Browse tours
        </a>
      </p>
    </LegalPageShell>
  );
}
