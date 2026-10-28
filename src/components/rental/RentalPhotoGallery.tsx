import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';

type Props = {
  photos: string[];
  title: string;
};

/** Tour/Stay mosaic parity for rental PDPs — title stays above this block on the page. */
export default function RentalPhotoGallery({ photos, title }: Props) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useDialogFocus(open, dialogRef, close);

  if (photos.length === 0) {
    return (
      <div className="flex aspect-[21/9] items-center justify-center rounded-xl bg-ink/[0.06] ring-1 ring-black/[0.04]">
        <p className="px-4 text-center text-sm text-ink-muted">No photos yet for this rental</p>
      </div>
    );
  }

  const openAt = (i: number) => {
    setIndex(i);
    setOpen(true);
  };
  const multi = photos.length > 1;

  return (
    <>
      <div>
        <div className={`grid grid-cols-1 gap-2 ${multi ? 'lg:grid-cols-4 lg:grid-rows-2 lg:h-[21rem] lg:gap-2' : ''}`}>
          <button
            type="button"
            onClick={() => openAt(0)}
            className={`relative overflow-hidden rounded-xl bg-ink/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0758CB] ${
              multi ? 'lg:col-span-2 lg:row-span-2 aspect-[4/3] lg:aspect-auto' : 'aspect-[16/10] max-h-[28rem]'
            }`}
            aria-label={`Open gallery, photo 1 of ${photos.length}`}
          >
            <img
              src={photos[0]}
              alt={title}
              decoding="async"
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 motion-safe:hover:scale-[1.02]"
            />
          </button>
          {photos.slice(1, 5).map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => openAt(i + 1)}
              className="relative hidden overflow-hidden rounded-xl bg-ink/10 aspect-[4/3] lg:block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0758CB]"
              aria-label={`Open gallery, photo ${i + 2} of ${photos.length}`}
            >
              <img
                src={url}
                alt={`${title}, photo ${i + 2}`}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
              {i === 3 && photos.length > 5 ? (
                <span className="absolute inset-0 flex items-center justify-center bg-ink/45 text-sm font-semibold text-white">
                  +{photos.length - 5} more
                </span>
              ) : null}
            </button>
          ))}
          {multi ? (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 snap-x snap-mandatory lg:hidden">
              {photos.map((url, photoIndex) => (
                <button
                  key={`m-${photoIndex}`}
                  type="button"
                  onClick={() => openAt(photoIndex)}
                  className={`relative shrink-0 snap-start overflow-hidden rounded-xl ${
                    photoIndex === 0 ? 'hidden' : 'aspect-[4/3] w-[42%]'
                  }`}
                  aria-label={`Photo ${photoIndex + 1} of ${photos.length}`}
                >
                  <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs tabular-nums text-ink-muted">
            {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
          </p>
          <button type="button" onClick={() => openAt(0)} className="tv-section-cta lux-flat text-xs">
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
            <p className="text-sm tabular-nums">
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
              alt={`${title} photo ${index + 1} of ${photos.length}`}
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
