type PagesFunction<Env = unknown> = (context: {
  request: Request;
  env: Env;
  waitUntil: (promise: Promise<unknown>) => void;
}) => Response | Promise<Response>;

type TilejsonRequest = {
  collection?: string;
  itemId?: string;
};

const MPC_TILEJSON_URL = 'https://planetarycomputer.microsoft.com/api/data/v1/item/tilejson.json';
const SENTINEL_COLLECTION = 'sentinel-2-l2a';
const CACHE_TTL_SECONDS = 30 * 60;

const jsonHeaders = {
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json; charset=utf-8',
};

export const onRequestOptions: PagesFunction = () => new Response(null, { headers: jsonHeaders });

export const onRequestPost: PagesFunction = async ({ request }) => {
  const tilejsonRequest = await readTilejsonRequest(request);
  const itemId = typeof tilejsonRequest.itemId === 'string' ? tilejsonRequest.itemId.trim() : '';
  const collection =
    typeof tilejsonRequest.collection === 'string' && tilejsonRequest.collection.trim()
      ? tilejsonRequest.collection.trim()
      : SENTINEL_COLLECTION;

  if (!itemId) {
    return json(
      {
        error: 'INVALID_TILEJSON_REQUEST',
        message: '缺少 STAC item id。',
      },
      400,
    );
  }

  const cacheKey = new Request(
    `${new URL(request.url).origin}/api/mpc/tilejson?collection=${encodeURIComponent(collection)}&item=${encodeURIComponent(
      itemId,
    )}`,
  );
  const edgeCache = (caches as CacheStorage & { default: Cache }).default;
  const cached = await edgeCache.match(cacheKey);

  if (cached) {
    return cached;
  }

  const url = new URL(MPC_TILEJSON_URL);
  url.searchParams.set('collection', collection);
  url.searchParams.set('item', itemId);
  url.searchParams.set('assets', 'visual');
  url.searchParams.set('asset_bidx', 'visual|1,2,3');
  url.searchParams.set('nodata', '0');
  url.searchParams.set('format', 'png');

  const mpcResponse = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!mpcResponse.ok) {
    return json(
      {
        error: 'MPC_TILEJSON_FAILED',
        message: `Microsoft Planetary Computer returned ${mpcResponse.status}.`,
      },
      502,
    );
  }

  const response = json(await mpcResponse.json(), 200, {
    'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
  });

  await edgeCache.put(cacheKey, response.clone());
  return response;
};

const methodNotAllowed: PagesFunction = () =>
  json(
    {
      error: 'METHOD_NOT_ALLOWED',
      message: 'Use POST /api/mpc/tilejson.',
    },
    405,
  );

export const onRequestGet = methodNotAllowed;
export const onRequestPut = methodNotAllowed;
export const onRequestPatch = methodNotAllowed;
export const onRequestDelete = methodNotAllowed;

async function readTilejsonRequest(request: Request): Promise<TilejsonRequest> {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return {};
  }

  try {
    return (await request.json()) as TilejsonRequest;
  } catch {
    return {};
  }
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
