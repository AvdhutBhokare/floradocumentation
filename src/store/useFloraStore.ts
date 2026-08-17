import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type {
  TreeRecord,
  ZoneFeature,
  ZoneReviewState,
  ZoneReviewStatus,
  ProjectMeta,
  ImportPreviewResult,
} from '../types/tree';
import { rowsToTreeRecords } from '../services/excel/importExcel';
import { nextTreeId } from '../utils/ids';
import { validateCoordinatePair } from '../utils/coordinates';
import { detectZoneForPoint } from '../services/gis/zoneDetection';
import { saveSnapshot, loadSnapshot, type PersistedState } from '../services/persistence/db';

export type FilterState = {
  zone: string | null;
  species: string | null;
  status: 'Existing' | 'New' | null;
  mapped: 'mapped' | 'unmapped' | null;
  complete: 'complete' | 'incomplete' | null;
  reviewStatus: ZoneReviewStatus | null;
  search: string;
};

const EMPTY_FILTERS: FilterState = {
  zone: null,
  species: null,
  status: null,
  mapped: null,
  complete: null,
  reviewStatus: null,
  search: '',
};

interface HistoryEntry {
  trees: TreeRecord[];
  zoneReview: ZoneReviewState[];
  label: string;
}

interface FloraState {
  project: ProjectMeta;
  trees: TreeRecord[];
  zones: ZoneFeature[];
  zoneReview: ZoneReviewState[];
  filters: FilterState;

  selectedTreeId: string | null;
  selectedZoneName: string | null;
  zoneReviewMode: boolean;
  addTreeArmed: boolean;
  pendingMapClick: { lat: number; lng: number } | null;

  /** bumped whenever the map should pan/zoom to + open the popup of selectedTreeId */
  mapFocusNonce: number;
  /** bumped whenever the spreadsheet should scroll to + highlight the row for selectedTreeId */
  gridFocusNonce: number;
  /** bumped whenever the map should zoom to fit the currently selected zone's polygon */
  zoneFocusNonce: number;

  /** When set, that tree's map pin is lifted out of the cluster and draggable. */
  repositioningTreeId: string | null;

  hydrated: boolean;
  dirty: boolean;

  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];

  // ---- project ----
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;
  setProjectName: (name: string) => void;
  newProject: (name: string) => void;

  // ---- import ----
  importFromPreview: (preview: ImportPreviewResult, mode: 'replace' | 'add') => void;
  importZones: (zones: ZoneFeature[], mode: 'replace' | 'add') => void;

  // ---- CRUD ----
  addTree: (partial: Partial<TreeRecord>) => TreeRecord;
  updateTree: (id: string, patch: Partial<TreeRecord>) => void;
  /**
   * For AG Grid-driven single-field edits specifically. AG Grid's default
   * valueSetter mutates params.data[field] in place *before* our code runs
   * (required for AG Grid to detect the edit at all — see the long comment
   * on this action's implementation). Since that mutation lands on the
   * live store object before pushHistory would normally run, this action
   * reconstructs the undo snapshot from the caller-supplied oldValue
   * (which AG Grid captures reliably before any mutation happens) instead
   * of trusting the array's state at call time.
   */
  updateTreeField: <K extends keyof TreeRecord>(
    id: string,
    field: K,
    oldValue: TreeRecord[K],
    newValue: TreeRecord[K]
  ) => void;
  updateTreeExtraField: (id: string, key: string, oldValue: string | number | null, newValue: string | number | null) => void;
  updateTreeCoordinates: (id: string, lat: number | null, lng: number | null) => void;
  deleteTree: (id: string) => void;
  bulkPasteRows: (
    startRowId: string | null,
    rows: string[][],
    columnOrder: (keyof TreeRecord | string)[]
  ) => void;

  // ---- selection / UI ----
  /** source 'grid' pans the map to the tree; source 'map' scrolls the grid to the row. */
  selectTree: (id: string | null, source?: 'grid' | 'map' | 'search' | 'silent') => void;
  selectZone: (name: string | null, focusMap?: boolean) => void;
  setZoneReviewMode: (on: boolean) => void;
  setAddTreeArmed: (on: boolean) => void;
  setPendingMapClick: (pt: { lat: number; lng: number } | null) => void;
  startRepositionTree: (id: string) => void;
  cancelRepositionTree: () => void;
  setFilters: (patch: Partial<FilterState>) => void;
  resetFilters: () => void;

  // ---- zone review ----
  setZoneReviewStatus: (zoneName: string, status: ZoneReviewStatus) => void;

  // ---- undo/redo ----
  undo: () => void;
  redo: () => void;
  pushHistory: (label: string) => void;
}

function makeDefaultProject(): ProjectMeta {
  return { name: 'Untitled Flora Survey', createdAt: Date.now(), updatedAt: Date.now() };
}

const MAX_HISTORY = 50;

export const useFloraStore = create<FloraState>((set, get) => ({
  project: makeDefaultProject(),
  trees: [],
  zones: [],
  zoneReview: [],
  filters: EMPTY_FILTERS,

  selectedTreeId: null,
  selectedZoneName: null,
  zoneReviewMode: false,
  addTreeArmed: false,
  pendingMapClick: null,
  mapFocusNonce: 0,
  gridFocusNonce: 0,
  zoneFocusNonce: 0,
  repositioningTreeId: null,

  hydrated: false,
  dirty: false,

  undoStack: [],
  redoStack: [],

  hydrate: async () => {
    const snap = await loadSnapshot();
    if (snap) {
      set({
        project: snap.meta,
        trees: snap.trees,
        zones: snap.zones,
        zoneReview: snap.zoneReview,
        hydrated: true,
      });
    } else {
      set({ hydrated: true });
    }
  },

  persist: async () => {
    const { project, trees, zones, zoneReview } = get();
    const state: PersistedState = {
      meta: { ...project, updatedAt: Date.now() },
      trees,
      zones,
      zoneReview,
    };
    await saveSnapshot(state);
    set({ dirty: false, project: state.meta });
  },

  setProjectName: (name) => {
    set((s) => ({ project: { ...s.project, name }, dirty: true }));
  },

  newProject: (name) => {
    set({
      project: { name, createdAt: Date.now(), updatedAt: Date.now() },
      trees: [],
      zones: [],
      zoneReview: [],
      filters: EMPTY_FILTERS,
      selectedTreeId: null,
      selectedZoneName: null,
      undoStack: [],
      redoStack: [],
      dirty: true,
    });
  },

  pushHistory: (label) => {
    const { trees, zoneReview, undoStack } = get();
    // Storing the array references directly (not clones) is safe *only*
    // because every store action below creates new arrays/objects instead
    // of mutating existing TreeRecord/ZoneReviewState objects in place —
    // see the defaultColDef.valueSetter comment in Spreadsheet.tsx for the
    // one place that used to violate this and silently corrupt history.
    // At 10,000+ records, cloning every record on every keystroke was the
    // single biggest source of editing lag; reference snapshots make
    // pushHistory O(1) instead of O(n).
    const entry: HistoryEntry = { trees, zoneReview, label };
    const next = [...undoStack, entry].slice(-MAX_HISTORY);
    set({ undoStack: next, redoStack: [] });
  },

  undo: () => {
    const { undoStack, redoStack, trees, zoneReview } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    const currentSnapshot: HistoryEntry = { trees, zoneReview, label: 'redo-point' };
    set({
      trees: prev.trees,
      zoneReview: prev.zoneReview,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, currentSnapshot],
      dirty: true,
    });
  },

  redo: () => {
    const { undoStack, redoStack, trees, zoneReview } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const currentSnapshot: HistoryEntry = { trees, zoneReview, label: 'undo-point' };
    set({
      trees: next.trees,
      zoneReview: next.zoneReview,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, currentSnapshot],
      dirty: true,
    });
  },

  importFromPreview: (preview, mode) => {
    get().pushHistory(mode === 'replace' ? 'Import (replace)' : 'Import (add)');
    const { trees } = get();
    const existingIds = new Set(trees.map((t) => t.id));
    const imported = rowsToTreeRecords(preview, mode === 'replace' ? new Set() : existingIds);

    if (mode === 'replace') {
      set({ trees: imported, selectedTreeId: null, dirty: true });
    } else {
      set({ trees: [...trees, ...imported], dirty: true });
    }
  },

  importZones: (zones, mode) => {
    if (mode === 'replace') {
      set({ zones, dirty: true });
    } else {
      set((s) => ({ zones: [...s.zones, ...zones], dirty: true }));
    }
    // seed zone review entries for any new zone names not yet tracked
    const names = new Set(get().zones.map((z) => z.name));
    set((s) => {
      const existingNames = new Set(s.zoneReview.map((z) => z.zoneName));
      const additions: ZoneReviewState[] = [...names]
        .filter((n) => !existingNames.has(n))
        .map((n) => ({ zoneName: n, status: 'Not Reviewed' as ZoneReviewStatus, updatedAt: Date.now() }));
      return { zoneReview: [...s.zoneReview, ...additions] };
    });
  },

  addTree: (partial) => {
    get().pushHistory('Add tree');
    const { trees, zones } = get();
    const id = partial.id ?? nextTreeId(trees.map((t) => t.id));
    const now = Date.now();

    let zoneName = partial.zoneName ?? '';
    if (!zoneName && partial.latitude != null && partial.longitude != null) {
      zoneName = detectZoneForPoint(partial.latitude, partial.longitude, zones) ?? '';
    }

    const record: TreeRecord = {
      id,
      speciesName: partial.speciesName ?? '',
      latitude: partial.latitude ?? null,
      longitude: partial.longitude ?? null,
      zoneName,
      treeStatus: partial.treeStatus ?? 'New',
      height: partial.height ?? null,
      isUnsaved: partial.isUnsaved ?? true,
      additionalFields: partial.additionalFields ?? {},
      createdAt: now,
      updatedAt: now,
    };
    set({ trees: [...trees, record], selectedTreeId: id, dirty: true });
    return record;
  },

  updateTree: (id, patch) => {
    get().pushHistory('Edit tree');
    set((s) => ({
      trees: s.trees.map((t) =>
        t.id === id ? { ...t, ...patch, updatedAt: Date.now(), isUnsaved: false } : t
      ),
      dirty: true,
    }));
  },

  // WHY THIS EXISTS (don't "simplify" this back into updateTree — see
  // Spreadsheet.tsx's defaultColDef comment for the full story):
  //
  // AG Grid's cell-edit pipeline mutates params.data[field] in place
  // *before* our onCellValueChanged handler runs, and it does this on
  // purpose — AG Grid re-reads the field from data afterward to decide
  // what actually changed. A non-mutating valueSetter (what an earlier
  // version of this file used, to protect undo history) makes AG Grid
  // conclude nothing changed and silently drop every edit — that's the bug
  // reported as "the location cannot be edited." So the grid must be
  // allowed to mutate normally again.
  //
  // That reintroduces the original problem: the mutation happens on the
  // exact object living in `trees`, before pushHistory() would run, so a
  // plain reference-based undo snapshot would capture the *already edited*
  // value. The fix: AG Grid also hands us `oldValue`, computed reliably
  // before any mutation. We use that directly to build the undo snapshot
  // instead of reading current array state, so this is correct regardless
  // of what the grid already did to the object.
  updateTreeField: (id, field, oldValue, newValue) => {
    set((s) => {
      const undoTrees = s.trees.map((t) => (t.id === id ? { ...t, [field]: oldValue } : t));
      const undoEntry: HistoryEntry = { trees: undoTrees, zoneReview: s.zoneReview, label: 'Edit tree' };
      const nextUndoStack = [...s.undoStack, undoEntry].slice(-MAX_HISTORY);

      const trees = s.trees.map((t) =>
        t.id === id ? { ...t, [field]: newValue, updatedAt: Date.now(), isUnsaved: false } : t
      );
      return { trees, undoStack: nextUndoStack, redoStack: [], dirty: true };
    });
  },

  updateTreeExtraField: (id, key, oldValue, newValue) => {
    set((s) => {
      const undoTrees = s.trees.map((t) =>
        t.id === id ? { ...t, additionalFields: { ...t.additionalFields, [key]: oldValue } } : t
      );
      const undoEntry: HistoryEntry = { trees: undoTrees, zoneReview: s.zoneReview, label: 'Edit tree' };
      const nextUndoStack = [...s.undoStack, undoEntry].slice(-MAX_HISTORY);

      const trees = s.trees.map((t) =>
        t.id === id
          ? {
              ...t,
              additionalFields: { ...t.additionalFields, [key]: newValue },
              updatedAt: Date.now(),
              isUnsaved: false,
            }
          : t
      );
      return { trees, undoStack: nextUndoStack, redoStack: [], dirty: true };
    });
  },

  updateTreeCoordinates: (id, lat, lng) => {
    get().pushHistory('Move tree');
    set((s) => ({
      trees: s.trees.map((t) =>
        t.id === id
          ? { ...t, latitude: lat, longitude: lng, updatedAt: Date.now(), isUnsaved: false }
          : t
      ),
      dirty: true,
    }));
  },

  deleteTree: (id) => {
    get().pushHistory('Delete tree');
    set((s) => ({
      trees: s.trees.filter((t) => t.id !== id),
      selectedTreeId: s.selectedTreeId === id ? null : s.selectedTreeId,
      dirty: true,
    }));
  },

  bulkPasteRows: (startRowId, rows, columnOrder) => {
    if (rows.length === 0) return;
    get().pushHistory('Paste data');
    const { trees, zones } = get();
    const startIndex = startRowId ? trees.findIndex((t) => t.id === startRowId) : trees.length;
    const treesById = new Map(trees.map((t) => [t.id, t]));
    const newTrees: TreeRecord[] = [];
    let idCursor = trees.map((t) => t.id);

    rows.forEach((rowValues, i) => {
      const targetIndex = startIndex + i;
      const existing = targetIndex >= 0 && targetIndex < trees.length ? trees[targetIndex] : null;

      const patch: Partial<TreeRecord> = {};
      const extraPatch: Record<string, string | number | null> = {};
      columnOrder.forEach((col, colIdx) => {
        const raw = rowValues[colIdx];
        if (raw === undefined) return;
        if (typeof col === 'string' && col.startsWith('extra:')) {
          extraPatch[col.slice('extra:'.length)] = raw === '' ? null : raw;
          return;
        }
        switch (col) {
          case 'speciesName':
            patch.speciesName = raw;
            break;
          case 'latitude': {
            const n = Number(raw);
            patch.latitude = Number.isFinite(n) && raw !== '' ? n : null;
            break;
          }
          case 'longitude': {
            const n = Number(raw);
            patch.longitude = Number.isFinite(n) && raw !== '' ? n : null;
            break;
          }
          case 'zoneName':
            patch.zoneName = raw;
            break;
          case 'treeStatus':
            patch.treeStatus = raw === 'Existing' || raw === 'New' ? raw : '';
            break;
          case 'height': {
            const n = Number(raw);
            patch.height = Number.isFinite(n) && raw !== '' ? n : null;
            break;
          }
          default:
            break;
        }
      });

      if (existing) {
        const merged: TreeRecord = {
          ...existing,
          ...patch,
          additionalFields: { ...existing.additionalFields, ...extraPatch },
          updatedAt: Date.now(),
        };
        treesById.set(existing.id, merged);
      } else {
        const id = nextTreeId(idCursor);
        idCursor = [...idCursor, id];
        const now = Date.now();
        let zoneName = patch.zoneName ?? '';
        if (!zoneName && patch.latitude != null && patch.longitude != null) {
          zoneName = detectZoneForPoint(patch.latitude, patch.longitude, zones) ?? '';
        }
        const record: TreeRecord = {
          id,
          speciesName: patch.speciesName ?? '',
          latitude: patch.latitude ?? null,
          longitude: patch.longitude ?? null,
          zoneName,
          treeStatus: patch.treeStatus ?? '',
          height: patch.height ?? null,
          additionalFields: extraPatch,
          createdAt: now,
          updatedAt: now,
        };
        newTrees.push(record);
      }
    });

    const merged = trees.map((t) => treesById.get(t.id) ?? t);
    set({ trees: [...merged, ...newTrees], dirty: true });
  },

  selectTree: (id, source) => {
    set((s) => ({
      selectedTreeId: id,
      mapFocusNonce: source === 'grid' || source === 'search' ? s.mapFocusNonce + 1 : s.mapFocusNonce,
      gridFocusNonce: source === 'map' ? s.gridFocusNonce + 1 : s.gridFocusNonce,
    }));
  },
  selectZone: (name, focusMap = true) => {
    set((s) => ({
      selectedZoneName: name,
      zoneFocusNonce: focusMap ? s.zoneFocusNonce + 1 : s.zoneFocusNonce,
    }));
  },
  setZoneReviewMode: (on) => set({ zoneReviewMode: on }),
  setAddTreeArmed: (on) => set({ addTreeArmed: on }),
  setPendingMapClick: (pt) => set({ pendingMapClick: pt }),
  startRepositionTree: (id) =>
    set((s) => ({
      repositioningTreeId: id,
      selectedTreeId: id,
      mapFocusNonce: s.mapFocusNonce + 1,
      addTreeArmed: false,
    })),
  cancelRepositionTree: () => set({ repositioningTreeId: null }),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: EMPTY_FILTERS }),

  setZoneReviewStatus: (zoneName, status) => {
    set((s) => {
      const idx = s.zoneReview.findIndex((z) => z.zoneName === zoneName);
      const updated: ZoneReviewState = { zoneName, status, updatedAt: Date.now() };
      if (idx === -1) return { zoneReview: [...s.zoneReview, updated], dirty: true };
      const next = [...s.zoneReview];
      next[idx] = updated;
      return { zoneReview: next, dirty: true };
    });
  },
}));

/** Helper (not a selector) for anything that needs a fresh unique id outside actions. */
export function generateClientId(): string {
  return uuid();
}

// Re-export for tests / non-component usage
export { validateCoordinatePair };
