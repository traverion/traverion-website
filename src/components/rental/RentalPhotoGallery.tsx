import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';

type Props = {
  photos: string[];
  title: string;
};

export default function RentalPhotoGallery({ photos, title }: Props) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useDialogFocus(open, dialogRef, close);

  if (photos.length === 0) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center rounded-2xl bg-[#F4F6F8] text-sm text-ink-muted">
        Photos coming soon
      </div>
    );
  }

  const alt = (i: number) => `${title} photo ${i + 1} of ${photos.length}`;
  const side = photos.slice(1, 5);
  const openAt = (i: number) => {
    setIndex(i);
    setOpen(true);
  };

  return (
    <>
      <div className="overflow-hidden rounded-2xl bg-[#F4F6F8] ring-1 ring-[#E6EAF0]">
        <div className={`grid gap-1 ${side.length > 0 ? 'sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]' : ''}`}>
          <button
            type="button"
            className="group relative block min-h-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#073b83]"
            onClick={() => openAt(0)}
          >
            <img
              src={photos[0]}
              alt={alt(0)}
              className="aspect-[16/10] h-full w-full object-cover transition duration-200 group-hover:brightness-[0.97] sm:aspect-auto sm:min-h-[18rem]"
            />
          </button>
          {side.length > 0 ? (
            <div className="hidden grid-cols-2 gap-1 sm:grid">
              {side.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  className="group relative min-h-0"
                  onClick={() => openAt(i + 1)}
                >
                  <img
                    src={url}
                    alt={alt(i + 1)}
                    className="aspect-[16/10] h-full w-full object-cover transition duration-200 group-hover:brightness-[0.97]"
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3 bg-white px-4 py-2.5">
          <p className="text-xs text-ink-muted">
            {photos.length} photo{photos.length === 1 ? '' : 's'}
          </p>
          <button type="button" className="text-sm font-semibold text-[#073b83]" onClick={() => openAt(0)}>
            View all photos
          </button>
        </div>
      </div>

      {open ? (
        <div
          ref={dialogRef}
          className="tv-gallery-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${title} photos`}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (photos.length < 2) return;
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              setIndex((current) => (current + 1) % photos.length);
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              setIndex((current) => (current - 1 + photos.length) % photos.length);
            }
          }}
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
            <button type="button" className="tv-gallery-lightbox__close" aria-label="Close photos" onClick={close}>
              <X className="h-6 w-6" strokeWidth={2.25} aria-hidden />
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6 sm:px-12">
            {photos.length > 1 ? (
              <button
                type="button"
                className="tv-gallery-lightbox__nav absolute left-3 z-10 sm:left-6"
                aria-label="Previous photo"
                onClick={() => setIndex((current) => (current - 1 + photos.length) % photos.length)}
              >
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
            <img
              src={photos[index]}
              alt={alt(index)}
              className="max-h-[min(78vh,900px)] max-w-full rounded-lg object-contain shadow-2xl"
            />
            {photos.length > 1 ? (
              <button
                type="button"
                className="tv-gallery-lightbox__nav absolute right-3 z-10 sm:right-6"
                aria-label="Next photo"
                onClick={() => setIndex((current) => (current + 1) % photos.length)}
              >
                <ChevronRight className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
