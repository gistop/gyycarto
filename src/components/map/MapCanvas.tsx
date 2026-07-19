import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Check, Crosshair, Layers, LocateFixed, Maximize2, Minus, Plus, Ruler } from 'lucide-react';
import type { MpcSearchResult } from '../../types/search';

type BaseLayer = 'streets' | 'esri-world-imagery';
type TilejsonResponse = {
  attribution?: string;
  bounds?: number[];
  maxzoom?: number;
  minzoom?: number;
  tiles?: string[];
  error?: string;
  message?: string;
};

const AOI_BBOX = [121.342691, 31.067863, 121.563309, 31.294137] as const;
const AOI_CENTER: [number, number] = [
  (AOI_BBOX[0] + AOI_BBOX[2]) / 2,
  (AOI_BBOX[1] + AOI_BBOX[3]) / 2,
];

const aoiPolygon: GeoJSON.Feature<GeoJSON.Polygon> = {
  geometry: {
    coordinates: [
      [
        [AOI_BBOX[0], AOI_BBOX[1]],
        [AOI_BBOX[2], AOI_BBOX[1]],
        [AOI_BBOX[2], AOI_BBOX[3]],
        [AOI_BBOX[0], AOI_BBOX[3]],
        [AOI_BBOX[0], AOI_BBOX[1]],
      ],
    ],
    type: 'Polygon',
  },
  properties: {
    name: 'MPC 检索范围',
  },
  type: 'Feature',
};

export function MapCanvas({ visibleResults }: { visibleResults: MpcSearchResult[] }) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const scaleControlRef = useRef<maplibregl.ScaleControl | null>(null);
  const rasterLayerIdsRef = useRef(new Map<string, { layerId: string; sourceId: string }>());
  const [baseLayer, setBaseLayer] = useState<BaseLayer>('streets');
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);
  const [isScaleVisible, setIsScaleVisible] = useState(true);
  const [mapReadout, setMapReadout] = useState({
    latitude: AOI_CENTER[1],
    longitude: AOI_CENTER[0],
    zoom: 10.5,
  });

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      attributionControl: false,
      center: AOI_CENTER,
      container: mapContainerRef.current,
      maxZoom: 19,
      minZoom: 2,
      pitch: 0,
      style: createMapStyle(baseLayer),
      zoom: 10.5,
    });

    mapRef.current = map;
    scaleControlRef.current = new maplibregl.ScaleControl({ maxWidth: 140, unit: 'metric' });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(scaleControlRef.current, 'bottom-left');

    map.on('load', () => addOperationalLayers(map));
    map.on('move', () => {
      const center = map.getCenter();
      setMapReadout({
        latitude: center.lat,
        longitude: center.lng,
        zoom: map.getZoom(),
      });
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      scaleControlRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    let isCancelled = false;
    const updateLayers = () => {
      updateVisibleResultBoundaries(map, visibleResults);
      void syncVisibleRasterLayers(map, visibleResults, rasterLayerIdsRef.current, () => isCancelled);
    };

    if (map.isStyleLoaded()) {
      updateLayers();
    } else {
      map.once('load', updateLayers);
    }

    return () => {
      isCancelled = true;
    };
  }, [visibleResults]);

  const zoomIn = () => mapRef.current?.zoomIn({ duration: 220 });
  const zoomOut = () => mapRef.current?.zoomOut({ duration: 220 });
  const locateAoi = () => fitAoi(mapRef.current);

  const selectBaseLayer = (nextLayer: BaseLayer) => {
    const map = mapRef.current;

    setBaseLayer(nextLayer);
    setIsLayerMenuOpen(false);
    rasterLayerIdsRef.current.clear();
    map?.setStyle(createMapStyle(nextLayer));
    map?.once('styledata', () => {
      addOperationalLayers(map);
      updateVisibleResultBoundaries(map, visibleResults);
      void syncVisibleRasterLayers(map, visibleResults, rasterLayerIdsRef.current);
    });
  };

  const toggleScale = () => {
    const map = mapRef.current;
    const scaleControl = scaleControlRef.current;

    if (!map || !scaleControl) {
      return;
    }

    if (isScaleVisible) {
      map.removeControl(scaleControl);
    } else {
      map.addControl(scaleControl, 'bottom-left');
    }

    setIsScaleVisible((visible) => !visible);
  };

  const toggleFullscreen = () => {
    const container = mapContainerRef.current?.parentElement;

    if (!container) {
      return;
    }

    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }

    void container.requestFullscreen();
  };

  return (
    <section className="map-workspace">
      <div className="map-toolbar">
        <div className="toolbar-group">
          <button aria-label="放大" onClick={zoomIn} type="button">
            <Plus size={17} />
          </button>
          <button aria-label="缩小" onClick={zoomOut} type="button">
            <Minus size={17} />
          </button>
          <button aria-label="定位到检索范围" onClick={locateAoi} type="button">
            <LocateFixed size={17} />
          </button>
          <div className="map-layer-menu-shell">
            <button
              aria-expanded={isLayerMenuOpen}
              aria-label="切换底图"
              onClick={() => setIsLayerMenuOpen((open) => !open)}
              type="button"
            >
              <Layers size={17} />
            </button>
            {isLayerMenuOpen && (
              <div className="map-layer-menu" role="menu">
                <button onClick={() => selectBaseLayer('streets')} role="menuitem" type="button">
                  <span>街道底图</span>
                  {baseLayer === 'streets' && <Check size={15} />}
                </button>
                <button onClick={() => selectBaseLayer('esri-world-imagery')} role="menuitem" type="button">
                  <span>Esri World Imagery</span>
                  {baseLayer === 'esri-world-imagery' && <Check size={15} />}
                </button>
              </div>
            )}
          </div>
          <button aria-label="显示或隐藏比例尺" onClick={toggleScale} type="button">
            <Ruler size={17} />
          </button>
          <button aria-label="全屏" onClick={toggleFullscreen} type="button">
            <Maximize2 size={17} />
          </button>
        </div>
      </div>

      <div className="map-stage">
        <div className="map-base">
          <div className="maplibre-map" ref={mapContainerRef} />
          <div className="map-crosshair" aria-hidden="true">
            <Crosshair size={22} />
          </div>
        </div>
      </div>

      <div className="map-statusbar">
        <span>经度 {mapReadout.longitude.toFixed(6)}</span>
        <span>纬度 {mapReadout.latitude.toFixed(6)}</span>
        <span>缩放 {mapReadout.zoom.toFixed(2)}</span>
        <span>坐标系 WGS84 / Web Mercator</span>
      </div>
    </section>
  );
}

function createMapStyle(baseLayer: BaseLayer): StyleSpecification {
  const isImagery = baseLayer === 'esri-world-imagery';

  return {
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    layers: [
      {
        id: isImagery ? 'esri-world-imagery' : 'osm-standard',
        source: 'base',
        type: 'raster',
      },
    ],
    sources: {
      base: {
        attribution: isImagery
          ? 'Tiles © Esri'
          : '© OpenStreetMap contributors',
        maxzoom: 19,
        tileSize: 256,
        tiles: [
          isImagery
            ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        ],
        type: 'raster',
      },
    },
    version: 8,
  };
}

function addOperationalLayers(map: MapLibreMap) {
  if (map.getSource('aoi')) {
    return;
  }

  map.addSource('aoi', {
    data: aoiPolygon,
    type: 'geojson',
  });
  map.addLayer({
    id: 'aoi-fill',
    paint: {
      'fill-color': '#16836f',
      'fill-opacity': 0.12,
    },
    source: 'aoi',
    type: 'fill',
  });
  map.addLayer({
    id: 'aoi-outline',
    paint: {
      'line-color': '#0f1720',
      'line-width': 2.5,
    },
    source: 'aoi',
    type: 'line',
  });

  fitAoi(map);
}

function updateVisibleResultBoundaries(map: MapLibreMap, visibleResults: MpcSearchResult[]) {
  const data = createResultFeatureCollection(visibleResults);
  const source = map.getSource('visible-results') as maplibregl.GeoJSONSource | undefined;

  if (source) {
    source.setData(data);
  } else {
    map.addSource('visible-results', {
      data,
      type: 'geojson',
    });
  }

  if (!map.getLayer('visible-results-fill')) {
    map.addLayer({
      id: 'visible-results-fill',
      paint: {
        'fill-color': '#2f64d6',
        'fill-opacity': 0.18,
      },
      source: 'visible-results',
      type: 'fill',
    });
  }

  if (!map.getLayer('visible-results-outline')) {
    map.addLayer({
      id: 'visible-results-outline',
      paint: {
        'line-color': '#2f64d6',
        'line-width': 2,
      },
      source: 'visible-results',
      type: 'line',
    });
  }

  if (!map.getLayer('visible-results-label')) {
    map.addLayer({
      id: 'visible-results-label',
      layout: {
        'text-field': ['get', 'id'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
      },
      paint: {
        'text-color': '#0f1720',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.2,
      },
      source: 'visible-results',
      type: 'symbol',
    });
  }

  if (visibleResults.length > 0) {
    fitBoundsToResults(map, visibleResults);
  }
}

async function syncVisibleRasterLayers(
  map: MapLibreMap,
  visibleResults: MpcSearchResult[],
  rasterLayerIds: Map<string, { layerId: string; sourceId: string }>,
  isCancelled: () => boolean = () => false,
) {
  const visibleIds = new Set(visibleResults.map((result) => result.id));

  for (const [resultId, ids] of rasterLayerIds) {
    if (visibleIds.has(resultId)) {
      continue;
    }

    if (map.getLayer(ids.layerId)) {
      map.removeLayer(ids.layerId);
    }

    if (map.getSource(ids.sourceId)) {
      map.removeSource(ids.sourceId);
    }

    rasterLayerIds.delete(resultId);
  }

  for (const result of visibleResults) {
    if (!result.bbox || rasterLayerIds.has(result.id)) {
      continue;
    }

    const layerKey = sanitizeLayerKey(result.id);
    const sourceId = `mpc-visual-source-${layerKey}`;
    const layerId = `mpc-visual-layer-${layerKey}`;
    const tilejson = await fetchVisualTilejson(result);

    if (isCancelled() || !tilejson.tiles?.length || map.getSource(sourceId)) {
      continue;
    }

    const rasterSource: maplibregl.RasterSourceSpecification = {
      bounds: result.bbox as [number, number, number, number],
      maxzoom: tilejson.maxzoom ?? 19,
      minzoom: tilejson.minzoom ?? 8,
      tileSize: 256,
      tiles: tilejson.tiles,
      type: 'raster',
    };

    if (tilejson.attribution) {
      rasterSource.attribution = tilejson.attribution;
    }

    map.addSource(sourceId, rasterSource);

    if (!map.getSource(sourceId)) {
      continue;
    }

    map.addLayer(
      {
        id: layerId,
        paint: {
          'raster-opacity': 0.88,
        },
        source: sourceId,
        type: 'raster',
      },
      map.getLayer('aoi-fill') ? 'aoi-fill' : undefined,
    );
    rasterLayerIds.set(result.id, { layerId, sourceId });
  }
}

async function fetchVisualTilejson(result: MpcSearchResult): Promise<TilejsonResponse> {
  const response = await fetch('/api/mpc/tilejson', {
    body: JSON.stringify({
      collection: result.collection,
      itemId: result.id,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  const payload = (await response.json()) as TilejsonResponse;

  if (!response.ok || payload.error) {
    throw new Error(payload.message || 'MPC 影像瓦片加载失败');
  }

  return payload;
}

function createResultFeatureCollection(results: MpcSearchResult[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    features: results.flatMap((result) => {
      if (!result.bbox || result.bbox.length !== 4) {
        return [];
      }

      const [minLon, minLat, maxLon, maxLat] = result.bbox;

      return [
        {
          geometry: {
            coordinates: [
              [
                [minLon, minLat],
                [maxLon, minLat],
                [maxLon, maxLat],
                [minLon, maxLat],
                [minLon, minLat],
              ],
            ],
            type: 'Polygon',
          },
          properties: {
            id: result.id,
          },
          type: 'Feature',
        },
      ];
    }),
    type: 'FeatureCollection',
  };
}

function sanitizeLayerKey(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function fitBoundsToResults(map: MapLibreMap, results: MpcSearchResult[]) {
  const boxes = results.filter((result): result is MpcSearchResult & { bbox: number[] } => Boolean(result.bbox));

  if (!boxes.length) {
    return;
  }

  const bounds = boxes.reduce(
    (current, result) =>
      current.extend([result.bbox[0], result.bbox[1]]).extend([result.bbox[2], result.bbox[3]]),
    new maplibregl.LngLatBounds(
      [boxes[0].bbox[0], boxes[0].bbox[1]],
      [boxes[0].bbox[2], boxes[0].bbox[3]],
    ),
  );

  map.fitBounds(bounds, {
    duration: 420,
    padding: 80,
  });
}

function fitAoi(map: MapLibreMap | null) {
  map?.fitBounds(
    [
      [AOI_BBOX[0], AOI_BBOX[1]],
      [AOI_BBOX[2], AOI_BBOX[3]],
    ],
    {
      duration: 420,
      padding: 80,
    },
  );
}
