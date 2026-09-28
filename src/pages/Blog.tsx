import { BookOpen } from 'lucide-react';
import LegalPageShell from '../components/LegalPageShell';
import EmptyState from '../components/EmptyState';

/** Route kept for old links; Traverion is not publishing editorial stories yet. */
export default function Blog({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const goTours = (e: React.MouseEvent) => {
    e.preventDefault();
    onNavigate?.('packages');
  };

  const goStays = (e: React.MouseEvent) => {
    e.preventDefault();
    onNavigate?.('stays');
  };

  const goContact = (e: React.MouseEvent) => {
    e.preventDefault();
    onNavigate?.('contact');
  };

  return (
    <LegalPageShell
      eyebrow="Explore"
      title="Stories coming later"
      subtitle="We are not publishing travel articles yet. Browse live tours and stays instead."
      onNavigate={onNavigate}
    >
      <EmptyState
        icon={BookOpen}
        className="py-2"
        title="No stories yet"
        body="When we publish guides, they will appear here. Until then, discover tours and stays from independent operators."
        action={
          <div className="flex flex-wrap gap-2">
            <a href="/packages" onClick={goTours} className="tv-btn-primary">
              Browse tours
            </a>
            <a href="/stays" onClick={goStays} className="tv-btn-ghost">
              Browse stays
            </a>
            {/* Phase 1649: Contact for editorial / partnership questions. */}
            <a href="/contact" onClick={goContact} className="tv-btn-ghost">
              Contact us
            </a>
            {/* Phase 1683: Home exit when stories are empty. */}
            <a
              href="/"
              onClick={(e) => {
                if (onNavigate) {
                  e.preventDefault();
                  onNavigate('home');
                }
              }}
              className="tv-btn-ghost"
            >
              Back to home
            </a>
          </div>
        }
      />
    </LegalPageShell>
  );
}
