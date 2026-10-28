import ListingPdpPhotoGallery from '../ListingPdpPhotoGallery';

type Props = {
  photos: string[];
  title: string;
};

/** @deprecated Prefer ListingPdpPhotoGallery — kept as a thin rental alias. */
export default function RentalPhotoGallery({ photos, title }: Props) {
  return <ListingPdpPhotoGallery photos={photos} title={title} emptyLabel="No photos yet for this rental" />;
}
