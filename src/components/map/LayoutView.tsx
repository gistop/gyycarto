import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import Ruler from '@scena/react-ruler';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MpcSearchResult } from '../../types/search';
import { getLayoutPaperPreset, type LayoutAdornmentId, type LayoutPaperId, type LayoutTool } from './layoutConfig';
import {
  addOperationalLayers,
  AOI_CENTER,
  createMapStyle,
  syncVisibleRasterLayers,
  updateVisibleResultBoundaries,
  type BaseLayer,
} from './MapCanvas';

const CSS_PIXEL_PER_MM = 96 / 25.4;
const EXPORT_DPI = 300;
const RULER_GUTTER_MM = 30;
const MIN_MAP_FRAME_SIZE_MM = 24;

type LayoutElementId = 'map-frame' | LayoutAdornmentId;
type ResizeHandle = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
type LayoutElementRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

const mapResizeHandles: ResizeHandle[] = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];

function mmToCssPx(valueMm: number, zoomScale: number) {
  return valueMm * CSS_PIXEL_PER_MM * zoomScale;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getExportPx(valueMm: number) {
  return Math.round((valueMm / 25.4) * EXPORT_DPI);
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('JPG export failed.'));
          return;
        }

        resolve(blob);
      },
      'image/jpeg',
      0.95,
    );
  });
}

async function setJpegDpi(blob: Blob, dpi: number) {
  const source = new Uint8Array(await blob.arrayBuffer());

  if (source.length < 2 || source[0] !== 0xff || source[1] !== 0xd8) {
    return blob;
  }

  const xDensityHigh = (dpi >> 8) & 0xff;
  const xDensityLow = dpi & 0xff;
  const yDensityHigh = xDensityHigh;
  const yDensityLow = xDensityLow;

  for (let offset = 2; offset < source.length - 17; ) {
    if (source[offset] !== 0xff) {
      break;
    }

    const marker = source[offset + 1];
    const length = (source[offset + 2] << 8) + source[offset + 3];

    if (marker === 0xe0 && source[offset + 4] === 0x4a && source[offset + 5] === 0x46 && source[offset + 6] === 0x49 && source[offset + 7] === 0x46 && source[offset + 8] === 0x00) {
      const patched = new Uint8Array(source);
      patched[offset + 11] = 1;
      patched[offset + 12] = xDensityHigh;
      patched[offset + 13] = xDensityLow;
      patched[offset + 14] = yDensityHigh;
      patched[offset + 15] = yDensityLow;
      return new Blob([patched], { type: 'image/jpeg' });
    }

    if (length <= 0) {
      break;
    }

    offset += 2 + length;
  }

  const app0 = new Uint8Array([
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x02,
    0x01,
    xDensityHigh,
    xDensityLow,
    yDensityHigh,
    yDensityLow,
    0x00,
    0x00,
  ]);
  const patched = new Uint8Array(source.length + app0.length);
  patched.set(source.slice(0, 2), 0);
  patched.set(app0, 2);
  patched.set(source.slice(2), 2 + app0.length);

  return new Blob([patched], { type: 'image/jpeg' });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function drawNorthArrow(ctx: CanvasRenderingContext2D, rect: LayoutElementRect, pxPerMm: number) {
  const x = rect.x * pxPerMm;
  const y = rect.y * pxPerMm;
  const width = rect.width * pxPerMm;
  const height = rect.height * pxPerMm;

  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.strokeStyle = '#172026';
  ctx.lineWidth = Math.max(1, pxPerMm * 0.25);
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);

  ctx.fillStyle = '#172026';
  ctx.beginPath();
  ctx.moveTo(x + width / 2, y + height * 0.16);
  ctx.lineTo(x + width * 0.22, y + height * 0.7);
  ctx.lineTo(x + width * 0.78, y + height * 0.7);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#172026';
  ctx.font = `${Math.max(9, height * 0.2)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', x + width / 2, y + height * 0.86);
  ctx.restore();
}

function drawScaleBar(ctx: CanvasRenderingContext2D, rect: LayoutElementRect, pxPerMm: number) {
  const x = rect.x * pxPerMm;
  const y = rect.y * pxPerMm;
  const width = rect.width * pxPerMm;
  const height = rect.height * pxPerMm;
  const padding = Math.max(4, pxPerMm * 1.6);
  const trackHeight = Math.max(6, height * 0.26);
  const trackY = y + padding;
  const trackWidth = width - padding * 2;
  const labelY = y + height - padding * 0.8;

  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.strokeStyle = '#172026';
  ctx.lineWidth = Math.max(1, pxPerMm * 0.25);
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);

  ctx.fillStyle = '#172026';
  ctx.fillRect(x + padding, trackY, trackWidth / 2, trackHeight);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + padding + trackWidth / 2, trackY, trackWidth / 2, trackHeight);
  ctx.strokeStyle = '#172026';
  ctx.strokeRect(x + padding, trackY, trackWidth, trackHeight);

  ctx.fillStyle = '#172026';
  ctx.font = `${Math.max(9, height * 0.24)}px Arial`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText('0', x + padding, labelY);
  ctx.textAlign = 'right';
  ctx.fillText('5 km', x + width - padding, labelY);
  ctx.restore();
}

function createInitialElementRects(paper: { heightMm: number; widthMm: number }): Record<LayoutElementId, LayoutElementRect> {
  const mapX = 11;
  const mapY = 18;
  const mapWidth = Math.max(MIN_MAP_FRAME_SIZE_MM, paper.widthMm - mapX * 2);
  const mapHeight = Math.max(MIN_MAP_FRAME_SIZE_MM, paper.heightMm - mapY - 11);

  return {
    'map-frame': {
      height: mapHeight,
      width: mapWidth,
      x: mapX,
      y: mapY,
    },
    'north-arrow': {
      height: 15,
      width: 12,
      x: Math.max(4, mapX + mapWidth - 16),
      y: mapY + 5,
    },
    'scale-bar': {
      height: 10,
      width: 36,
      x: mapX + 5,
      y: Math.max(4, mapY + mapHeight - 15),
    },
  };
}

export function LayoutView({
  baseLayer,
  exportRequestId,
  layoutAdornmentIds,
  layoutMapZoom,
  layoutTool,
  layoutTileZoom,
  layoutZoom,
  onLayoutMapZoomChange,
  paperSize,
  visibleResults,
}: {
  baseLayer: BaseLayer;
  exportRequestId: number;
  layoutAdornmentIds: LayoutAdornmentId[];
  layoutMapZoom: number;
  layoutTool: LayoutTool;
  layoutTileZoom: number;
  layoutZoom: number;
  onLayoutMapZoomChange: (zoom: number) => void;
  paperSize: LayoutPaperId;
  visibleResults: MpcSearchResult[];
}) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const lastExportRequestIdRef = useRef(0);
  const layoutMapZoomRef = useRef(layoutMapZoom);
  const skipNextMapZoomEffectRef = useRef(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const rasterLayerIdsRef = useRef(new Map<string, { layerId: string; sourceId: string }>());
  const paper = getLayoutPaperPreset(paperSize);
  const panStartRef = useRef<{
    clientX: number;
    clientY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [elementRects, setElementRects] = useState(() => createInitialElementRects(paper));
  const [paperOffset, setPaperOffset] = useState({ x: 0, y: 0 });
  const [rulerOffset, setRulerOffset] = useState({ left: 0, top: 0 });
  const [selectedElementId, setSelectedElementId] = useState<LayoutElementId | null>(null);
  const zoomScale = layoutZoom / 100;
  const pageWidthPx = Math.round(mmToCssPx(paper.widthMm, zoomScale));
  const pageHeightPx = Math.round(mmToCssPx(paper.heightMm, zoomScale));
  const rulerGutterPx = Math.round(mmToCssPx(RULER_GUTTER_MM, zoomScale));
  const rulerZoom = CSS_PIXEL_PER_MM * zoomScale;
  const rulerScrollLeftMm = (rulerOffset.left - paperOffset.x) / rulerZoom - RULER_GUTTER_MM;
  const rulerScrollTopMm = (rulerOffset.top - paperOffset.y) / rulerZoom - RULER_GUTTER_MM;

  useEffect(() => {
    layoutMapZoomRef.current = layoutMapZoom;
  }, [layoutMapZoom]);

  useEffect(() => {
    setPaperOffset({ x: 0, y: 0 });
    setElementRects(createInitialElementRects(paper));
  }, [paperSize]);

  useEffect(() => {
    if (layoutTool !== 'select') {
      setSelectedElementId(null);
    }
  }, [layoutTool]);

  useEffect(() => {
    if (selectedElementId && selectedElementId !== 'map-frame' && !layoutAdornmentIds.includes(selectedElementId)) {
      setSelectedElementId(null);
    }
  }, [layoutAdornmentIds, selectedElementId]);

  useEffect(() => {
    if (exportRequestId <= 0 || lastExportRequestIdRef.current === exportRequestId) {
      return;
    }

    lastExportRequestIdRef.current = exportRequestId;

    const exportLayoutJpg = async () => {
      const map = mapRef.current;

      if (!map) {
        return;
      }

      map.resize();
      await waitForNextFrame();

      const exportCanvas = document.createElement('canvas');
      const widthPx = getExportPx(paper.widthMm);
      const heightPx = getExportPx(paper.heightMm);
      const pxPerMm = widthPx / paper.widthMm;
      const ctx = exportCanvas.getContext('2d');

      if (!ctx) {
        return;
      }

      exportCanvas.width = widthPx;
      exportCanvas.height = heightPx;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, widthPx, heightPx);

      const mapRect = elementRects['map-frame'];
      const mapX = mapRect.x * pxPerMm;
      const mapY = mapRect.y * pxPerMm;
      const mapWidth = mapRect.width * pxPerMm;
      const mapHeight = mapRect.height * pxPerMm;
      const mapCanvas = map.getCanvas();

      ctx.fillStyle = '#dce5e5';
      ctx.fillRect(mapX, mapY, mapWidth, mapHeight);
      ctx.drawImage(mapCanvas, mapX, mapY, mapWidth, mapHeight);
      ctx.strokeStyle = '#172026';
      ctx.lineWidth = Math.max(1, pxPerMm * 0.25);
      ctx.strokeRect(mapX, mapY, mapWidth, mapHeight);

      if (layoutAdornmentIds.includes('north-arrow')) {
        drawNorthArrow(ctx, elementRects['north-arrow'], pxPerMm);
      }

      if (layoutAdornmentIds.includes('scale-bar')) {
        drawScaleBar(ctx, elementRects['scale-bar'], pxPerMm);
      }

      try {
        const jpegBlob = await canvasToJpegBlob(exportCanvas);
        const dpiBlob = await setJpegDpi(jpegBlob, EXPORT_DPI);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        downloadBlob(dpiBlob, `layout-map-${paper.shortLabel}-${EXPORT_DPI}dpi-${timestamp}.jpg`);
      } catch (error) {
        window.alert('导出 JPG 失败，请稍后重试。');
        console.error(error);
      }
    };

    void exportLayoutJpg();
  }, [elementRects, exportRequestId, layoutAdornmentIds, paper]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      attributionControl: false,
      canvasContextAttributes: {
        preserveDrawingBuffer: true,
      },
      center: AOI_CENTER,
      container: mapContainerRef.current,
      maxZoom: 19,
      minZoom: 2,
      pitch: 0,
      style: createMapStyle(baseLayer, layoutTileZoom),
      zoom: layoutMapZoomRef.current,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('moveend', () => {
      const actualZoom = map.getZoom();
      const nextZoom = Math.round(actualZoom);

      if (nextZoom !== layoutMapZoomRef.current) {
        skipNextMapZoomEffectRef.current = true;
        onLayoutMapZoomChange(nextZoom);
      }
    });
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

    if (skipNextMapZoomEffectRef.current) {
      skipNextMapZoomEffectRef.current = false;
      return;
    }

    if (!map || Math.abs(map.getZoom() - layoutMapZoom) < 0.01) {
      return;
    }

    map.jumpTo({ zoom: layoutMapZoom });
  }, [layoutMapZoom]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    rasterLayerIdsRef.current.clear();
    map.setStyle(createMapStyle(baseLayer, layoutTileZoom), { diff: false });
    map.once('style.load', () => {
      addOperationalLayers(map);
      updateVisibleResultBoundaries(map, visibleResults);
      void syncVisibleRasterLayers(map, visibleResults, rasterLayerIdsRef.current, undefined, layoutTileZoom);
    });
  }, [baseLayer, layoutTileZoom]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    let isCancelled = false;
    const updateLayers = () => {
      updateVisibleResultBoundaries(map, visibleResults);
      void syncVisibleRasterLayers(map, visibleResults, rasterLayerIdsRef.current, () => isCancelled, layoutTileZoom);
    };

    if (map.isStyleLoaded()) {
      updateLayers();
    } else {
      map.once('style.load', updateLayers);
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
      offsetX: paperOffset.x,
      offsetY: paperOffset.y,
    };
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveBoardPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = panStartRef.current;

    if (!start || layoutTool !== 'pan') {
      return;
    }

    setPaperOffset({
      x: start.offsetX + event.clientX - start.clientX,
      y: start.offsetY + event.clientY - start.clientY,
    });
  };

  const stopBoardPan = () => {
    panStartRef.current = null;
  };

  const rectToStyle = (rect: LayoutElementRect) => ({
    height: mmToCssPx(rect.height, zoomScale),
    left: mmToCssPx(rect.x, zoomScale),
    top: mmToCssPx(rect.y, zoomScale),
    width: mmToCssPx(rect.width, zoomScale),
  });

  const beginPageSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (layoutTool !== 'select' || event.target !== event.currentTarget) {
      return;
    }

    setSelectedElementId(null);
  };

  const beginElementDrag = (elementId: LayoutElementId, event: React.PointerEvent<HTMLDivElement>) => {
    if (layoutTool !== 'select') {
      return;
    }

    const startRect = elementRects[elementId];
    const startClientX = event.clientX;
    const startClientY = event.clientY;

    setSelectedElementId(elementId);
    event.preventDefault();
    event.stopPropagation();

    const handleMove = (moveEvent: PointerEvent) => {
      const deltaX = (moveEvent.clientX - startClientX) / rulerZoom;
      const deltaY = (moveEvent.clientY - startClientY) / rulerZoom;

      setElementRects((current) => ({
        ...current,
        [elementId]: {
          ...current[elementId],
          x: clamp(startRect.x + deltaX, 0, paper.widthMm - startRect.width),
          y: clamp(startRect.y + deltaY, 0, paper.heightMm - startRect.height),
        },
      }));
    };

    const stopMove = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stopMove);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stopMove);
  };

  const beginMapResize = (handle: ResizeHandle, event: React.PointerEvent<HTMLSpanElement>) => {
    if (layoutTool !== 'select') {
      return;
    }

    const startRect = elementRects['map-frame'];
    const startClientX = event.clientX;
    const startClientY = event.clientY;

    setSelectedElementId('map-frame');
    event.preventDefault();
    event.stopPropagation();

    const handleMove = (moveEvent: PointerEvent) => {
      const deltaX = (moveEvent.clientX - startClientX) / rulerZoom;
      const deltaY = (moveEvent.clientY - startClientY) / rulerZoom;
      let nextX = startRect.x;
      let nextY = startRect.y;
      let nextWidth = startRect.width;
      let nextHeight = startRect.height;

      if (handle.includes('w')) {
        const right = startRect.x + startRect.width;
        nextX = clamp(startRect.x + deltaX, 0, right - MIN_MAP_FRAME_SIZE_MM);
        nextWidth = right - nextX;
      }

      if (handle.includes('e')) {
        nextWidth = clamp(startRect.width + deltaX, MIN_MAP_FRAME_SIZE_MM, paper.widthMm - startRect.x);
      }

      if (handle.includes('n')) {
        const bottom = startRect.y + startRect.height;
        nextY = clamp(startRect.y + deltaY, 0, bottom - MIN_MAP_FRAME_SIZE_MM);
        nextHeight = bottom - nextY;
      }

      if (handle.includes('s')) {
        nextHeight = clamp(startRect.height + deltaY, MIN_MAP_FRAME_SIZE_MM, paper.heightMm - startRect.y);
      }

      setElementRects((current) => ({
        ...current,
        'map-frame': {
          height: nextHeight,
          width: nextWidth,
          x: nextX,
          y: nextY,
        },
      }));
    };

    const stopResize = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stopResize);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stopResize);
  };

  return (
    <section
      className={
        layoutTool === 'pan'
          ? 'layout-workspace pan-mode'
          : layoutTool === 'select'
            ? 'layout-workspace select-mode'
            : 'layout-workspace'
      }
    >
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
        <div
          className="layout-canvas"
          style={{
            padding: rulerGutterPx,
            transform: `translate(${paperOffset.x}px, ${paperOffset.y}px)`,
          }}
        >
          <div
            className="layout-page"
            onPointerDown={beginPageSelection}
            style={{ height: pageHeightPx, width: pageWidthPx }}
          >
            <div className="layout-page-label">
              <span>{paper.label}</span>
              <strong>
                {layoutZoom}% / {paper.widthMm} x {paper.heightMm} mm
              </strong>
            </div>
            <div
              className={selectedElementId === 'map-frame' ? 'layout-map-frame selected' : 'layout-map-frame'}
              onPointerDown={(event) => beginElementDrag('map-frame', event)}
              style={rectToStyle(elementRects['map-frame'])}
            >
              <div className="layout-maplibre" ref={mapContainerRef} />
              {selectedElementId === 'map-frame' &&
                mapResizeHandles.map((handle) => (
                  <span
                    aria-hidden="true"
                    className={`layout-resize-handle ${handle}`}
                    key={handle}
                    onPointerDown={(event) => beginMapResize(handle, event)}
                  />
                ))}
            </div>
            {layoutAdornmentIds.includes('north-arrow') && (
              <div
                aria-label="North arrow"
                className={selectedElementId === 'north-arrow' ? 'layout-north-arrow selected' : 'layout-north-arrow'}
                onPointerDown={(event) => beginElementDrag('north-arrow', event)}
                role="button"
                style={rectToStyle(elementRects['north-arrow'])}
                tabIndex={0}
              >
                <span>N</span>
              </div>
            )}
            {layoutAdornmentIds.includes('scale-bar') && (
              <div
                aria-label="Scale bar"
                className={selectedElementId === 'scale-bar' ? 'layout-scale-bar selected' : 'layout-scale-bar'}
                onPointerDown={(event) => beginElementDrag('scale-bar', event)}
                role="button"
                style={rectToStyle(elementRects['scale-bar'])}
                tabIndex={0}
              >
                <div className="layout-scale-track">
                  <span />
                  <span />
                </div>
                <strong>0</strong>
                <strong>5 km</strong>
              </div>
              )}
          </div>
        </div>
      </div>
    </section>
  );
}
