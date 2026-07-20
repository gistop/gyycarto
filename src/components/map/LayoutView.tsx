import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import Ruler from '@scena/react-ruler';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MpcSearchResult } from '../../types/search';
import { getLayoutPaperPreset, type LayoutPaperId, type LayoutTool } from './layoutConfig';
import {
  addOperationalLayers,
  AOI_CENTER,
  createMapStyle,
  syncVisibleRasterLayers,
  updateVisibleResultBoundaries,
  type BaseLayer,
} from './MapCanvas';

const CSS_PIXEL_PER_MM = 96 / 25.4;
const RULER_GUTTER_MM = 30;

function mmToCssPx(valueMm: number, zoomScale: number) {
  return valueMm * CSS_PIXEL_PER_MM * zoomScale;
}

export function LayoutView({
  baseLayer,
  layoutTool,
  layoutZoom,
  paperSize,
  visibleResults,
}: {
  baseLayer: BaseLayer;
  layoutTool: LayoutTool;
  layoutZoom: number;
  paperSize: LayoutPaperId;
  visibleResults: MpcSearchResult[];
}) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const rasterLayerIdsRef = useRef(new Map<string, { layerId: string; sourceId: string }>());
  const panStartRef = useRef<{
    clientX: number;
    clientY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [rulerOffset, setRulerOffset] = useState({ left: 0, top: 0 });
  const paper = getLayoutPaperPreset(paperSize);
  const zoomScale = layoutZoom / 100;
  const pageWidthPx = Math.round(mmToCssPx(paper.widthMm, zoomScale));
  const pageHeightPx = Math.round(mmToCssPx(paper.heightMm, zoomScale));
  const rulerGutterPx = Math.round(mmToCssPx(RULER_GUTTER_MM, zoomScale));
  const rulerZoom = CSS_PIXEL_PER_MM * zoomScale;
  const rulerScrollLeftMm = rulerOffset.left / rulerZoom - RULER_GUTTER_MM;
  const rulerScrollTopMm = rulerOffset.top / rulerZoom - RULER_GUTTER_MM;

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
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', () => addOperationalLayers(map));

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    rasterLayerIdsRef.current.clear();
    map.setStyle(createMapStyle(baseLayer));
    map.once('styledata', () => {
      addOperationalLayers(map);
      updateVisibleResultBoundaries(map, visibleResults);
      void syncVisibleRasterLayers(map, visibleResults, rasterLayerIdsRef.current);
    });
  }, [baseLayer]);

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

  const handleBoardScroll = () => {
    const board = boardRef.current;

    if (!board) {
      return;
    }

    setRulerOffset({
      left: board.scrollLeft,
      top: board.scrollTop,
    });
  };

  const beginBoardPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const board = boardRef.current;

    if (!board || layoutTool !== 'pan') {
      return;
    }

    panStartRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: board.scrollLeft,
      scrollTop: board.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveBoardPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const board = boardRef.current;
    const start = panStartRef.current;

    if (!board || !start || layoutTool !== 'pan') {
      return;
    }

    board.scrollLeft = start.scrollLeft - (event.clientX - start.clientX);
    board.scrollTop = start.scrollTop - (event.clientY - start.clientY);
  };

  const stopBoardPan = () => {
    panStartRef.current = null;
  };

  return (
    <section className={layoutTool === 'pan' ? 'layout-workspace pan-mode' : 'layout-workspace'}>
      <div className="layout-ruler-corner" aria-hidden="true" />
      <div className="layout-ruler layout-ruler-top" aria-hidden="true">
        <Ruler
          backgroundColor="#f6f8f9"
          direction="end"
          lineColor="#667a84"
          negativeRuler={false}
          range={[0, paper.widthMm]}
          scrollPos={rulerScrollLeftMm}
          segment={10}
          textColor="#54646d"
          textFormat={(scale) => `${scale}`}
          type="horizontal"
          unit={10}
          zoom={rulerZoom}
        />
      </div>
      <div className="layout-ruler layout-ruler-left" aria-hidden="true">
        <Ruler
          backgroundColor="#f6f8f9"
          direction="end"
          lineColor="#667a84"
          negativeRuler={false}
          range={[0, paper.heightMm]}
          scrollPos={rulerScrollTopMm}
          segment={10}
          textColor="#54646d"
          textFormat={(scale) => `${scale}`}
          type="vertical"
          unit={10}
          zoom={rulerZoom}
        />
      </div>
      <div
        className="layout-board"
        onPointerCancel={stopBoardPan}
        onPointerDown={beginBoardPan}
        onPointerMove={moveBoardPan}
        onPointerUp={stopBoardPan}
        onScroll={handleBoardScroll}
        ref={boardRef}
      >
        <div className="layout-canvas" style={{ padding: rulerGutterPx }}>
          <div className="layout-page" style={{ height: pageHeightPx, width: pageWidthPx }}>
            <div className="layout-page-label">
              <span>{paper.label}</span>
              <strong>
                {layoutZoom}% / {paper.widthMm} x {paper.heightMm} mm
              </strong>
            </div>
            <div className="layout-map-frame">
              <div className="layout-maplibre" ref={mapContainerRef} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
