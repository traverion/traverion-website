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
      eyebrow="Explore"
      title="Stories coming later"
      subtitle="We are not publishing travel articles yet. Browse live tours instead."
      onNavigate={onNavigate}
    >
      <EmptyState
        icon={BookOpen}
        className="py-2"
        title="No stories yet"
        body="When we publish guides, they will appear here. Until then, discover tours from independent operators."
        action={
          <a href="/packages" onClick={goTours} className="tv-btn-primary">
            Browse tours
          </a>
        }
      />
    </LegalPageShell>
  );
}
