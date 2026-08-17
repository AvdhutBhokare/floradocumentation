import { useCallback, useRef, useState } from 'react';

export function useResizablePanel(initial = 320, min = 140, max = 720) {
  const [height, setHeight] = useState(initial);
  const [collapsed, setCollapsed] = useState(false);
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);

  const onStartResize = useCallback(
    (e: React.MouseEvent) => {
      dragState.current = { startY: e.clientY, startHeight: height };

      function onMove(ev: MouseEvent) {
        if (!dragState.current) return;
        const delta = dragState.current.startY - ev.clientY;
        const next = Math.min(max, Math.max(min, dragState.current.startHeight + delta));
        setHeight(next);
      }
      function onUp() {
        dragState.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [height, min, max]
  );

  return {
    height,
    collapsed,
    toggleCollapsed: () => setCollapsed((v) => !v),
    onStartResize,
  };
}
