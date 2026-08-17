import { useCallback, useEffect, useState } from 'react';
import { Header } from './components/Layout/Header';
import { StatsBar } from './components/Dashboard/StatsBar';
import { ZonePanel } from './components/ZonePanel/ZonePanel';
import { MapView } from './components/Map/MapView';
import { Spreadsheet } from './components/Spreadsheet/Spreadsheet';
import { TreeFormModal } from './components/TreeForm/TreeFormModal';
import { ImportExcelModal } from './components/Import/ImportExcelModal';
import { ImportKmlModal } from './components/Import/ImportKmlModal';
import { ToastHost } from './components/Common/Toast';
import { useFloraStore } from './store/useFloraStore';
import { useFilteredTrees } from './store/selectors';
import { useResizablePanel } from './hooks/useResizablePanel';

type Modal =
  | { kind: 'none' }
  | { kind: 'import-excel' }
  | { kind: 'import-kml' }
  | { kind: 'add-tree'; lat: number; lng: number }
  | { kind: 'edit-tree'; id: string };

export default function App() {
  const hydrate = useFloraStore((s) => s.hydrate);
  const hydrated = useFloraStore((s) => s.hydrated);
  const persist = useFloraStore((s) => s.persist);
  const dirty = useFloraStore((s) => s.dirty);
  const undo = useFloraStore((s) => s.undo);
  const redo = useFloraStore((s) => s.redo);
  const pendingMapClick = useFloraStore((s) => s.pendingMapClick);
  const setPendingMapClick = useFloraStore((s) => s.setPendingMapClick);
  const setAddTreeArmed = useFloraStore((s) => s.setAddTreeArmed);
  const trees = useFloraStore((s) => s.trees);

  const filteredTrees = useFilteredTrees();
  const [modal, setModal] = useState<Modal>({ kind: 'none' });
  const { height, collapsed, toggleCollapsed, onStartResize } = useResizablePanel(320, 160, 720);

  // Load persisted project on first mount.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Autosave (debounced) whenever data changes, satisfying "survive
  // refresh/accidental tab closure" (Section 37) without needing an
  // explicit Save click every time.
  useEffect(() => {
    if (!hydrated || !dirty) return;
    const t = setTimeout(() => {
      persist();
    }, 1200);
    return () => clearTimeout(t);
  }, [hydrated, dirty, persist, trees]);

  // Warn before closing/refreshing the tab with unsaved changes.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Global undo/redo keyboard shortcuts.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isEditable =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (isEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // A confirmed map click while "+ Add Tree" is armed opens the Add Tree form
  // (Section 16) pre-filled with the exact clicked coordinates.
  useEffect(() => {
    if (pendingMapClick) {
      setModal({ kind: 'add-tree', lat: pendingMapClick.lat, lng: pendingMapClick.lng });
      setPendingMapClick(null);
      setAddTreeArmed(false);
    }
  }, [pendingMapClick, setPendingMapClick, setAddTreeArmed]);

  // Marker popup "Edit" button dispatches this event (see TreeMarkerLayer).
  useEffect(() => {
    function handleEdit(e: Event) {
      const id = (e as CustomEvent).detail?.id as string;
      if (id) setModal({ kind: 'edit-tree', id });
    }
    window.addEventListener('flora:edit-tree', handleEdit);
    return () => window.removeEventListener('flora:edit-tree', handleEdit);
  }, []);

  const closeModal = useCallback(() => setModal({ kind: 'none' }), []);

  if (!hydrated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bark-950">
        <span className="font-mono text-sm text-bark-500">Loading project…</span>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-bark-950">
      <Header onImportExcel={() => setModal({ kind: 'import-excel' })} onImportKml={() => setModal({ kind: 'import-kml' })} />
      <StatsBar />

      <div className="flex min-h-0 flex-1">
        <ZonePanel />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <MapView trees={filteredTrees} />
          </div>
          <Spreadsheet
            collapsed={collapsed}
            height={height}
            onToggleCollapsed={toggleCollapsed}
            onStartResize={onStartResize}
          />
        </div>
      </div>

      {trees.length === 0 && <EmptyStateHint onImportExcel={() => setModal({ kind: 'import-excel' })} />}

      {modal.kind === 'import-excel' && <ImportExcelModal onClose={closeModal} />}
      {modal.kind === 'import-kml' && <ImportKmlModal onClose={closeModal} />}
      {modal.kind === 'add-tree' && (
        <TreeFormModal mode="add" initialLat={modal.lat} initialLng={modal.lng} onClose={closeModal} />
      )}
      {modal.kind === 'edit-tree' && <TreeFormModal mode="edit" treeId={modal.id} onClose={closeModal} />}
      <ToastHost />
    </div>
  );
}

function EmptyStateHint({ onImportExcel }: { onImportExcel: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center">
      <div className="pointer-events-auto max-w-sm rounded-lg border border-hairline bg-bark-850/95 p-6 text-center shadow-2xl">
        <h2 className="font-display text-sm font-semibold tracking-wide text-paper-100">
          No tree data yet
        </h2>
        <p className="mt-2 font-sans text-xs leading-relaxed text-bark-500">
          Import the Excel file exported from Epic Collect to get started, or try the sample
          survey data in <span className="font-mono text-paper-200">public/sample-data/</span>.
        </p>
        <button
          type="button"
          onClick={onImportExcel}
          className="mt-4 rounded bg-flag px-4 py-2 font-sans text-xs font-semibold text-bark-950 hover:brightness-110"
        >
          Import Excel
        </button>
      </div>
    </div>
  );
}
