import { useCallback, useMemo, useState } from 'react';
import { AiAssistantPanel } from './panels/AiAssistantPanel';
import { LeftOperationsPanel, type WorkflowTabId } from './panels/LeftOperationsPanel';
import { MapCanvas, type BaseLayer } from './map/MapCanvas';
import { LayoutView } from './map/LayoutView';
import type { LayoutPaperId, LayoutTool } from './map/layoutConfig';
import type { MpcSearchResult } from '../types/search';

type DragTarget = 'left' | 'right';

const LEFT_SNAP_DISTANCE = 24;
const RIGHT_SNAP_DISTANCE = 24;
const MIN_CENTER_WIDTH = 560;
const DEFAULT_LEFT_WIDTH = 360;
const DEFAULT_RIGHT_WIDTH = 380;

export function WorkspaceLayout() {
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const [activeWorkflowTab, setActiveWorkflowTab] = useState<WorkflowTabId>('data');
  const [baseLayer, setBaseLayer] = useState<BaseLayer>('streets');
  const [layoutTool, setLayoutTool] = useState<LayoutTool>('select');
  const [layoutZoom, setLayoutZoom] = useState(100);
  const [paperSize, setPaperSize] = useState<LayoutPaperId>('custom-145x100');
  const [visibleResultIds, setVisibleResultIds] = useState<string[]>([]);
  const [visibleResults, setVisibleResults] = useState<MpcSearchResult[]>([]);

  const beginResize = useCallback(
    (target: DragTarget) => (event: React.PointerEvent<HTMLDivElement>) => {
      const workspace = event.currentTarget.parentElement;

      if (!workspace) {
        return;
      }

      const bounds = workspace.getBoundingClientRect();
      const startX = event.clientX;
      const startLeft = leftWidth;
      const startRight = rightWidth;

      event.currentTarget.setPointerCapture(event.pointerId);

      const handleMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;

        if (target === 'left') {
          const maxLeft = Math.max(0, bounds.width - MIN_CENTER_WIDTH - rightWidth - 16);
          const nextLeft = Math.min(Math.max(startLeft + delta, 0), maxLeft);
          setLeftWidth(nextLeft <= LEFT_SNAP_DISTANCE ? 0 : nextLeft);
          return;
        }

        const activeLeftWidth = leftWidth === 0 ? 0 : leftWidth;
        const maxRight = Math.max(0, bounds.width - MIN_CENTER_WIDTH - activeLeftWidth - 16);
        const nextRight = Math.min(Math.max(startRight - delta, 0), maxRight);
        setRightWidth(nextRight <= RIGHT_SNAP_DISTANCE ? 0 : nextRight);
      };

      const stopResize = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', stopResize);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', stopResize);
    },
    [leftWidth, rightWidth],
  );

  const gridTemplateColumns = useMemo(
    () => `${leftWidth}px 8px minmax(${MIN_CENTER_WIDTH}px, 1fr) 8px ${rightWidth}px`,
    [leftWidth, rightWidth],
  );

  const toggleResultOnMap = useCallback((result: MpcSearchResult) => {
    setVisibleResults((current) => {
      if (current.some((item) => item.id === result.id)) {
        return current.filter((item) => item.id !== result.id);
      }

      return [...current, result];
    });
    setVisibleResultIds((current) =>
      current.includes(result.id) ? current.filter((id) => id !== result.id) : [...current, result.id],
    );
  }, []);

  const resetVisibleResults = useCallback(() => {
    setVisibleResultIds([]);
    setVisibleResults([]);
  }, []);

  return (
    <main className="workspace" style={{ gridTemplateColumns }}>
      <LeftOperationsPanel
        activeTab={activeWorkflowTab}
        isCollapsed={leftWidth === 0}
        layoutTool={layoutTool}
        layoutZoom={layoutZoom}
        onActiveTabChange={setActiveWorkflowTab}
        onLayoutToolChange={setLayoutTool}
        onLayoutZoomChange={setLayoutZoom}
        onPaperSizeChange={setPaperSize}
        onResetVisibleResults={resetVisibleResults}
        onToggleResultOnMap={toggleResultOnMap}
        paperSize={paperSize}
        visibleResultIds={visibleResultIds}
      />
      <div
        aria-label="调整左侧操作面板宽度"
        className={leftWidth === 0 ? 'resize-handle left-collapsed' : 'resize-handle'}
        onPointerDown={beginResize('left')}
        role="separator"
      />
      {activeWorkflowTab === 'cartography' ? (
        <LayoutView baseLayer={baseLayer} layoutTool={layoutTool} layoutZoom={layoutZoom} paperSize={paperSize} visibleResults={visibleResults} />
      ) : (
        <MapCanvas baseLayer={baseLayer} onBaseLayerChange={setBaseLayer} visibleResults={visibleResults} />
      )}
      <div
        aria-label="调整右侧 AI 面板宽度"
        className={rightWidth === 0 ? 'resize-handle right-collapsed' : 'resize-handle'}
        onPointerDown={beginResize('right')}
        role="separator"
      />
      <AiAssistantPanel isCollapsed={rightWidth === 0} />
    </main>
  );
}
