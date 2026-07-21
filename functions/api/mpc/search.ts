type PagesFunction<Env = unknown> = (context: {
  request: Request;
  env: Env;
  waitUntil: (promise: Promise<unknown>) => void;
}) => Response | Promise<Response>;

type MpcSearchRequest = {
  bbox?: number[];
  cloudCoverMax?: number;
  datetime?: {
    start?: string;
    end?: string;
  };
  maxResults?: number;
};

type SearchProviderId = 'mpc' | 'earth-search';

type NormalizedSearchRequest = {
  bbox: [number, number, number, number];
  cloudCoverMax: number;
  datetime: string;
  maxResults: number;
};

type StacAsset = {
  href?: string;
  title?: string;
  type?: string;
};

type StacLink = {
  rel?: string;
  href?: string;
  method?: string;
  body?: unknown;
};

type StacFeature = {
  id: string;
  collection?: string;
  bbox?: number[];
  assets?: Record<string, StacAsset>;
  properties?: {
    datetime?: string;
    platform?: string;
    'eo:cloud_cover'?: number;
    's2:mgrs_tile'?: string;
  };
};

type StacSearchResponse = {
  features?: StacFeature[];
  links?: StacLink[];
  context?: {
    returned?: number;
    matched?: number;
  };
};

const searchProviders: Record<SearchProviderId, { collection: string; label: string; searchUrl: string }> = {
  mpc: {
    collection: 'sentinel-2-l2a',
    label: 'Microsoft Planetary Computer',
    searchUrl: 'https://planetarycomputer.microsoft.com/api/stac/v1/search',
  },
  'earth-search': {
    collection: 'sentinel-2-l2a',
    label: 'Element 84 Earth Search',
    searchUrl: 'https://earth-search.aws.element84.com/v1/search',
  },
};
const searchProviderIds = Object.keys(searchProviders) as SearchProviderId[];
const SENTINEL_COLLECTION = 'sentinel-2-l2a';
const DEFAULT_BBOX: [number, number, number, number] = [121.342691, 31.067863, 121.563309, 31.294137];
const DEFAULT_DATE_START = '2026-01-01';
const DEFAULT_DATE_END = '2026-07-18';
const CACHE_TTL_SECONDS = 10 * 60;
const MPC_PAGE_SIZE = 100;
const MAX_RESULTS_LIMIT = 500;

const jsonHeaders = {
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = () => new Response(null, { headers: jsonHeaders });

export const onRequestPost: PagesFunction = async ({ request }) => {
  const rawSearchRequest = await readSearchRequest(request);
  const normalizedSearch = normalizeSearchRequest(rawSearchRequest);

  if ('error' in normalizedSearch) {
    return json(
      {
        error: 'INVALID_SEARCH_REQUEST',
        message: normalizedSearch.error,
      },
      400,
    );
  }

  const cacheKey = new Request(
    `${new URL(request.url).origin}/api/mpc/search?params=${encodeURIComponent(
      JSON.stringify(normalizedSearch),
    )}`,
  );
  const edgeCache = (caches as CacheStorage & { default: Cache }).default;
  const cached = await edgeCache.match(cacheKey);

  if (cached) {
    return cached;
  }

  const providerResults = await Promise.allSettled(
    searchProviderIds.map(async (providerId) => {
      const provider = searchProviders[providerId];
      const searchResult = await fetchAllStacFeatures(
        provider,
        buildSearchBody(provider.collection, normalizedSearch),
        normalizedSearch.maxResults,
      );

      return {
        collection: provider.collection,
        error: null,
        matched: searchResult.matched,
        provider: providerId,
        providerName: provider.label,
        returned: searchResult.features.length,
        results: searchResult.features.map((feature) => normalizeFeature(feature, providerId)),
        truncated: searchResult.truncated,
      };
    }),
  );

  const providers = Object.fromEntries(
    providerResults.map((result, index) => {
      const providerId = searchProviderIds[index];
      const provider = searchProviders[providerId];

      if (result.status === 'fulfilled') {
        return [providerId, result.value];
      }

      return [
        providerId,
        {
          collection: provider.collection,
          error: result.reason instanceof Error ? result.reason.message : `${provider.label} search failed.`,
          matched: undefined,
          provider: providerId,
          providerName: provider.label,
          returned: 0,
          results: [],
          truncated: false,
        },
      ];
    }),
  ) as Record<
    SearchProviderId,
    {
      collection: string;
      error: string | null;
      matched?: number;
      provider: SearchProviderId;
      providerName: string;
      returned: number;
      results: ReturnType<typeof normalizeFeature>[];
      truncated: boolean;
    }
  >;

  if (Object.values(providers).every((provider) => provider.error)) {
    return json(
      {
        error: 'STAC_SEARCH_FAILED',
        message: '所有 STAC 目录检索失败，请稍后重试。',
        providers,
      },
      502,
    );
  }

  const response = json(
    {
      bbox: normalizedSearch.bbox,
      cloudCoverMax: normalizedSearch.cloudCoverMax,
      datetime: normalizedSearch.datetime,
      maxResults: normalizedSearch.maxResults,
      providers,
    },
    200,
    {
      'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
    },
  );

  await edgeCache.put(cacheKey, response.clone());
  return response;
};

const methodNotAllowed: PagesFunction = () =>
  json(
    {
      error: 'METHOD_NOT_ALLOWED',
      message: 'Use POST /api/mpc/search.',
    },
    405,
  );

export const onRequestGet = methodNotAllowed;
export const onRequestPut = methodNotAllowed;
export const onRequestPatch = methodNotAllowed;
export const onRequestDelete = methodNotAllowed;

async function readSearchRequest(request: Request): Promise<MpcSearchRequest> {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return {};
  }

  try {
    return (await request.json()) as MpcSearchRequest;
  } catch {
    return {};
  }
}

function normalizeSearchRequest(request: MpcSearchRequest): NormalizedSearchRequest | { error: string } {
  const bbox = normalizeBbox(request.bbox);

  if ('error' in bbox) {
    return bbox;
  }

  const datetime = normalizeDatetime(request.datetime?.start, request.datetime?.end);

  if (typeof datetime !== 'string') {
    return datetime;
  }

  return {
    bbox,
    cloudCoverMax: clampCloudCover(request.cloudCoverMax),
    datetime,
    maxResults: clampMaxResults(request.maxResults),
  };
}

function buildSearchBody(collection: string, normalizedSearch: NormalizedSearchRequest) {
  return {
    bbox: normalizedSearch.bbox,
    collections: [collection],
    datetime: normalizedSearch.datetime,
    limit: Math.min(MPC_PAGE_SIZE, normalizedSearch.maxResults),
    query: {
      'eo:cloud_cover': {
        lte: normalizedSearch.cloudCoverMax,
      },
    },
    sortby: [
      {
        direction: 'desc',
        field: 'properties.datetime',
      },
    ],
  };
}

function normalizeBbox(value: unknown): [number, number, number, number] | { error: string } {
  const bbox = Array.isArray(value) ? value : DEFAULT_BBOX;

  if (bbox.length !== 4 || !bbox.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))) {
    return { error: '经纬度范围必须包含 4 个数字：最小经度、最小纬度、最大经度、最大纬度。' };
  }

  const [minLon, minLat, maxLon, maxLat] = bbox;

  if (minLon < -180 || maxLon > 180 || minLat < -90 || maxLat > 90 || minLon >= maxLon || minLat >= maxLat) {
    return { error: '经纬度范围不合法，请检查最小值和最大值。' };
  }

  return [minLon, minLat, maxLon, maxLat];
}

function normalizeDatetime(start?: string, end?: string): string | { error: string } {
  const dateStart = start || DEFAULT_DATE_START;
  const dateEnd = end || DEFAULT_DATE_END;

  if (!isDateString(dateStart) || !isDateString(dateEnd)) {
    return { error: '开始日期和结束日期必须是 YYYY-MM-DD 格式。' };
  }

  if (dateStart > dateEnd) {
    return { error: '开始日期不能晚于结束日期。' };
  }

  return `${dateStart}T00:00:00Z/${dateEnd}T23:59:59Z`;
}

function isDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function clampCloudCover(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 20;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function clampMaxResults(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return MAX_RESULTS_LIMIT;
  }

  return Math.min(MAX_RESULTS_LIMIT, Math.max(1, Math.round(value)));
}

async function fetchAllStacFeatures(
  provider: (typeof searchProviders)[SearchProviderId],
  firstBody: Record<string, unknown>,
  maxResults: number,
): Promise<{ features: StacFeature[]; matched?: number; truncated: boolean }> {
  const features: StacFeature[] = [];
  let matched: number | undefined;
  let nextRequest: RequestInit & { url: string } | null = {
    body: JSON.stringify(firstBody),
    headers: stacHeaders(),
    method: 'POST',
    url: provider.searchUrl,
  };

  while (nextRequest && features.length < maxResults) {
    const stacResponse = await fetch(nextRequest.url, {
      body: nextRequest.body,
      headers: nextRequest.headers,
      method: nextRequest.method,
    });

    if (!stacResponse.ok) {
      throw new Error(`${provider.label} returned ${stacResponse.status}.`);
    }

    const payload = (await stacResponse.json()) as StacSearchResponse;
    matched = matched ?? payload.context?.matched;
    features.push(...(payload.features ?? []).slice(0, maxResults - features.length));
    nextRequest = buildNextRequest(payload.links);
  }

  return {
    features,
    matched,
    truncated: Boolean(nextRequest),
  };
}

function buildNextRequest(links?: StacLink[]): (RequestInit & { url: string }) | null {
  const nextLink = links?.find((link) => link.rel === 'next' && link.href);

  if (!nextLink?.href) {
    return null;
  }

  const method = nextLink.method?.toUpperCase() || 'GET';

  return {
    body: method === 'POST' && nextLink.body ? JSON.stringify(nextLink.body) : undefined,
    headers: stacHeaders(),
    method,
    url: nextLink.href,
  };
}

function stacHeaders() {
  return {
    Accept: 'application/geo+json, application/json',
    'Content-Type': 'application/json',
  };
}

function normalizeFeature(feature: StacFeature, providerId: SearchProviderId) {
  const thumbnail = feature.assets?.thumbnail?.href;
  const visual = feature.assets?.visual?.href ?? feature.assets?.rendered_preview?.href;

  return {
    id: feature.id,
    provider: providerId,
    providerName: searchProviders[providerId].label,
    collection: feature.collection ?? SENTINEL_COLLECTION,
    datetime: feature.properties?.datetime ?? null,
    cloudCover: feature.properties?.['eo:cloud_cover'] ?? null,
    platform: feature.properties?.platform ?? null,
    mgrsTile: feature.properties?.['s2:mgrs_tile'] ?? null,
    bbox: feature.bbox ?? null,
    assets: {
      thumbnail: thumbnail ?? null,
      visual: visual ?? null,
    },
  };
}

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...jsonHeaders,
      ...headers,
    },
    status,
  });
}
