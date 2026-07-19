export type MpcSearchResult = {
  id: string;
  collection: string;
  datetime: string | null;
  cloudCover: number | null;
  platform: string | null;
  mgrsTile: string | null;
  bbox: number[] | null;
  assets: {
    thumbnail: string | null;
    visual: string | null;
  };
};
