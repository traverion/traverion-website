import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { goProductReturn } from '../lib/navReturn';

type LegalPageShellProps = {
  title: string;
  subtitle?: string;
  onNavigate?: (page: string) => void;
  children: ReactNode;
};

export default function LegalPageShell({ title, subtitle, onNavigate, children }: LegalPageShellProps) {
  return (
    <div className="min-h-screen bg-paper pt-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 motion-safe:animate-fade-in">
        <button
          type="button"
          onClick={() => goProductReturn(onNavigate)}
          className="tv-btn-ghost mb-8 -ml-2"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          Back
        </button>
        <h1 className="font-display text-3xl sm:text-5xl text-ink tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-3 text-base text-ink-muted max-w-xl leading-relaxed">{subtitle}</p> : null}
        <div className="mt-10 space-y-10 text-ink leading-relaxed [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-ink [&_h2]:mt-10 [&_h2]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_p]:text-ink-muted">
          {children}
        </div>
      </div>
    </div>
  );
}
