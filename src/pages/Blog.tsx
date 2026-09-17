import { BookOpen } from 'lucide-react';
import LegalPageShell from '../components/LegalPageShell';
import EmptyState from '../components/EmptyState';

/** Route kept for old links; Traverion is not publishing editorial stories yet. */
export default function Blog({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const goTours = (e: React.MouseEvent) => {
    e.preventDefault();
    onNavigate?.('packages');
  };

  return (
    <LegalPageShell
      title="Stories coming later"
      subtitle="We are not publishing travel articles yet. Browse live tours instead."
      onNavigate={onNavigate}
    >
      <div className="not-prose rounded-2xl bg-paper-raised px-4 py-2 shadow-soft ring-1 ring-black/[0.06] sm:px-6">
        <EmptyState
          icon={BookOpen}
          title="No stories published yet"
          body="Destination guides will return when we have real operator stories worth sharing. Until then, the marketplace is the product."
          action={
            <a href="/packages" onClick={goTours} className="tv-btn-primary inline-flex">
              Browse tours
            </a>
          }
        />
      </div>
    </LegalPageShell>
  );
}
