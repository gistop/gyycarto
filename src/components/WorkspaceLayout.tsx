import { useCallback, useMemo, useState } from 'react';
import { AiAssistantPanel } from './panels/AiAssistantPanel';
import { LeftOperationsPanel } from './panels/LeftOperationsPanel';
import { MapCanvas } from './map/MapCanvas';

type DragTarget = 'left' | 'right';

const LEFT_SNAP_DISTANCE = 24;
const RIGHT_SNAP_DISTANCE = 24;
const MIN_CENTER_WIDTH = 560;
const DEFAULT_LEFT_WIDTH = 360;
const DEFAULT_RIGHT_WIDTH = 380;

export function WorkspaceLayout() {
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);

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

  return (
    <main className="workspace" style={{ gridTemplateColumns }}>
      <LeftOperationsPanel isCollapsed={leftWidth === 0} />
      <div
        aria-label="调整左侧操作面板宽度"
        className={leftWidth === 0 ? 'resize-handle left-collapsed' : 'resize-handle'}
        onPointerDown={beginResize('left')}
        role="separator"
      />
      <MapCanvas />
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
