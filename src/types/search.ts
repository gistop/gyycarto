export type SearchProviderId = 'mpc' | 'earth-search';

export type MpcSearchResult = {
  id: string;
  provider: SearchProviderId;
  providerName: string;
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

export function getSearchResultKey(result: Pick<MpcSearchResult, 'id' | 'provider'>) {
  return `${result.provider}:${result.id}`;
}
