import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

type Props = {
  photos: string[];
  title: string;
};

export default function RentalPhotoGallery({ photos, title }: Props) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key === 'ArrowRight') setIndex((current) => (current + 1) % photos.length);
      if (event.key === 'ArrowLeft') {
        setIndex((current) => (current - 1 + photos.length) % photos.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, photos.length]);

  if (photos.length === 0) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center rounded-2xl bg-[#F4F6F8] text-sm text-ink-muted">
        Photos coming soon
      </div>
    );
  }

  const alt = (i: number) => `${title} photo ${i + 1} of ${photos.length}`;
  const side = photos.slice(1, 5);

  return (
    <>
      <div className="overflow-hidden rounded-2xl bg-[#F4F6F8]">
        <div className={`grid gap-1 ${side.length > 0 ? 'sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]' : ''}`}>
          <button
            type="button"
            className="group relative block min-h-0 text-left"
            onClick={() => {
              setIndex(0);
              setOpen(true);
            }}
          >
            <img src={photos[0]} alt={alt(0)} className="aspect-[16/10] h-full w-full object-cover sm:aspect-auto sm:min-h-[18rem]" />
          </button>
          {side.length > 0 ? (
            <div className="hidden grid-cols-2 gap-1 sm:grid">
              {side.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  className="relative min-h-0"
                  onClick={() => {
                    setIndex(i + 1);
                    setOpen(true);
                  }}
                >
                  <img src={url} alt={alt(i + 1)} className="aspect-[16/10] h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3 bg-white px-4 py-2.5">
          <p className="text-xs text-ink-muted">
            {photos.length} photo{photos.length === 1 ? '' : 's'}
          </p>
          <button
            type="button"
            className="text-sm font-semibold text-[#073b83]"
            onClick={() => {
              setIndex(0);
              setOpen(true);
            }}
          >
            View all photos
          </button>
        </div>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex flex-col bg-[#0f172a]/92"
          role="dialog"
          aria-modal="true"
          aria-label={`${title} photos`}
          onTouchStart={(event) => setTouchX(event.changedTouches[0]?.clientX ?? null)}
          onTouchEnd={(event) => {
            if (touchX == null) return;
            const dx = (event.changedTouches[0]?.clientX ?? touchX) - touchX;
            if (dx > 40) setIndex((current) => (current - 1 + photos.length) % photos.length);
            if (dx < -40) setIndex((current) => (current + 1) % photos.length);
            setTouchX(null);
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <p className="text-sm">
              {index + 1} / {photos.length}
            </p>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
              aria-label="Close photos"
              onClick={() => setOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-12">
            <img src={photos[index]} alt={alt(index)} className="max-h-full max-w-full object-contain" />
            {photos.length > 1 ? (
              <>
                <button
                  type="button"
                  className="absolute left-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-ink"
                  aria-label="Previous photo"
                  onClick={() => setIndex((current) => (current - 1 + photos.length) % photos.length)}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="absolute right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-ink"
                  aria-label="Next photo"
                  onClick={() => setIndex((current) => (current + 1) % photos.length)}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
