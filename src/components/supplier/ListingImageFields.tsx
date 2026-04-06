import { useRef, useState } from 'react';
import {
  isListingImageStoragePublicUrl,
  removeListingImageIfOwned,
  uploadListingImage,
} from '../../data/supabase-listing-images';

type PickTarget = 'hero' | number;

type ListingImageFieldsProps = {
  heroUrl: string;
  galleryUrls: string[];
  onHeroUrl: (url: string) => void;
  onGalleryUrls: (urls: string[]) => void;
  userId: string | null | undefined;
  uploadsEnabled: boolean;
};

function previewUrl(url: string): string | null {
  const t = url.trim();
  return t || null;
}

export default function ListingImageFields({
  heroUrl,
  galleryUrls,
  onHeroUrl,
  onGalleryUrls,
  userId,
  uploadsEnabled,
}: ListingImageFieldsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<PickTarget | null>(null);
  const [busyTarget, setBusyTarget] = useState<PickTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openPicker = (target: PickTarget) => {
    setError(null);
    pickRef.current = target;
    fileRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const target = pickRef.current;
    pickRef.current = null;
    if (!file || !userId || !uploadsEnabled || target == null) return;

    setBusyTarget(target);
    setError(null);
    const prevUrl =
      target === 'hero' ? heroUrl.trim() : (galleryUrls[target] ?? '').trim();
    const { publicUrl, error: upErr } = await uploadListingImage(userId, file);
    setBusyTarget(null);
    if (upErr || !publicUrl) {
      setError(upErr ?? 'Upload failed');
      return;
    }
    if (target === 'hero') {
      onHeroUrl(publicUrl);
      if (prevUrl && isListingImageStoragePublicUrl(prevUrl)) {
        void removeListingImageIfOwned(userId, prevUrl);
      }
    } else {
      const next = [...galleryUrls];
      next[target] = publicUrl;
      onGalleryUrls(next);
      if (prevUrl && isListingImageStoragePublicUrl(prevUrl)) {
        void removeListingImageIfOwned(userId, prevUrl);
      }
    }
  };

  const removeHero = () => {
    const prev = heroUrl.trim();
    onHeroUrl('');
    if (userId && prev && isListingImageStoragePublicUrl(prev)) {
      void removeListingImageIfOwned(userId, prev);
    }
  };

  const removeGallerySlot = (index: number) => {
    const prev = (galleryUrls[index] ?? '').trim();
    const next = galleryUrls.map((u, i) => (i === index ? '' : u));
    onGalleryUrls(next);
    if (userId && prev && isListingImageStoragePublicUrl(prev)) {
      void removeListingImageIfOwned(userId, prev);
    }
  };

  const makeMainFromGallery = (index: number) => {
    const g = (galleryUrls[index] ?? '').trim();
    if (!g) return;
    const prevHero = heroUrl.trim();
    const next = galleryUrls.map((u, i) => (i === index ? prevHero : u));
    onHeroUrl(g);
    onGalleryUrls(next);
  };

  const heroPreview = previewUrl(heroUrl);

  return (
    <div className="space-y-6">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(ev) => void handleFile(ev)}
      />

      {error && (
        <p className="text-sm text-red-600 rounded-lg border border-red-200 bg-red-50 px-3 py-2" role="alert">
          {error}
        </p>
      )}

      <div id="supplier-listing-field-image" className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">Main photo *</label>
        <p className="text-xs text-gray-500">
          This is the large image at the top of your listing. Upload from your phone or computer, or paste a link
          below.
        </p>
        <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
          {heroPreview ? (
            <img
              src={heroPreview}
              alt="Listing main"
              className="w-full max-h-56 object-cover bg-gray-100"
            />
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[140px] text-center px-4 py-8 text-sm text-gray-500">
              No main photo yet — add one before publishing.
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!uploadsEnabled || busyTarget !== null}
            onClick={() => openPicker('hero')}
            className="touch-manipulation px-4 py-2.5 rounded-lg bg-finland text-white text-sm font-medium hover:bg-finland-dark disabled:opacity-50 min-h-[44px]"
          >
            {busyTarget === 'hero' ? 'Uploading…' : heroPreview ? 'Replace main photo' : 'Upload main photo'}
          </button>
          {heroPreview && (
            <button
              type="button"
              disabled={busyTarget !== null}
              onClick={removeHero}
              className="touch-manipulation px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 min-h-[44px]"
            >
              Remove main photo
            </button>
          )}
        </div>
        {!uploadsEnabled && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Connect Supabase and sign in to upload files. Until then, paste image URLs.
          </p>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Main photo URL (optional)</label>
          <input
            type="url"
            value={heroUrl}
            onChange={(e) => onHeroUrl(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-finland text-sm"
            placeholder="https://… or use Upload above"
          />
        </div>
      </div>

      <div id="supplier-listing-field-gallery" className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">More photos</label>
        <p className="text-xs text-gray-500">
          Up to three extra images in the gallery. Publishing needs at least one photo in addition to the main image.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {galleryUrls.map((url, index) => {
            const p = previewUrl(url);
            const busy = busyTarget === index;
            return (
              <div
                key={index}
                className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col"
              >
                <div className="aspect-[4/3] bg-gray-50 flex items-center justify-center">
                  {p ? (
                    <img src={p} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-gray-400 px-2 text-center">Empty slot {index + 1}</span>
                  )}
                </div>
                <div className="p-2 flex flex-col gap-2 border-t border-gray-100">
                  <button
                    type="button"
                    disabled={!uploadsEnabled || busyTarget !== null}
                    onClick={() => openPicker(index)}
                    className="touch-manipulation w-full py-2 rounded-lg bg-finland/10 text-finland text-sm font-medium hover:bg-finland/15 disabled:opacity-50 min-h-[40px]"
                  >
                    {busy ? 'Uploading…' : p ? 'Replace' : 'Upload'}
                  </button>
                  {p && (
                    <>
                      <button
                        type="button"
                        disabled={busyTarget !== null}
                        onClick={() => makeMainFromGallery(index)}
                        className="touch-manipulation w-full py-2 rounded-lg border border-gray-200 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Use as main photo
                      </button>
                      <button
                        type="button"
                        disabled={busyTarget !== null}
                        onClick={() => removeGallerySlot(index)}
                        className="touch-manipulation w-full py-2 rounded-lg text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </>
                  )}
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => {
                      const next = galleryUrls.map((u, i) => (i === index ? e.target.value : u));
                      onGalleryUrls(next);
                    }}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs"
                    placeholder="Or paste URL"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
