import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  CellKeyDownEvent,
  CellValueChangedEvent,
  ColDef,
  GetRowIdParams,
  RowClassParams,
} from 'ag-grid-community';
import { ensureAgGridModulesRegistered } from './agGridSetup';
import { useFloraStore } from '../../store/useFloraStore';
import { useFilteredTrees, isTreeComplete, isTreeMapped } from '../../store/selectors';
import type { TreeRecord } from '../../types/tree';

ensureAgGridModulesRegistered();

interface Props {
  collapsed: boolean;
  height: number;
  onToggleCollapsed: () => void;
  onStartResize: (e: React.MouseEvent) => void;
}

const CANONICAL_FIELDS: (keyof TreeRecord | string)[] = [
  'speciesName',
  'latitude',
  'longitude',
  'zoneName',
  'treeStatus',
  'height',
];

export function Spreadsheet({ collapsed, height, onToggleCollapsed, onStartResize }: Props) {
  const trees = useFilteredTrees();
  const allTrees = useFloraStore((s) => s.trees);
  const updateTree = useFloraStore((s) => s.updateTree);
  const updateTreeField = useFloraStore((s) => s.updateTreeField);
  const updateTreeExtraField = useFloraStore((s) => s.updateTreeExtraField);
  const deleteTree = useFloraStore((s) => s.deleteTree);
  const addTree = useFloraStore((s) => s.addTree);
  const selectTree = useFloraStore((s) => s.selectTree);
  const selectedTreeId = useFloraStore((s) => s.selectedTreeId);
  const gridFocusNonce = useFloraStore((s) => s.gridFocusNonce);
  const bulkPasteRows = useFloraStore((s) => s.bulkPasteRows);

  const gridRef = useRef<AgGridReact<TreeRecord>>(null);
  const focusedCellRef = useRef<{ rowId: string | null; colIndex: number }>({
    rowId: null,
    colIndex: 0,
  });

  const [quickFilter, setQuickFilter] = useState('');

  const extraColumnKeys = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const t of allTrees) {
      for (const k of Object.keys(t.additionalFields)) {
        if (!seen.has(k)) {
          seen.add(k);
          ordered.push(k);
        }
      }
    }
    return ordered;
  }, [allTrees]);

  const columnDefs = useMemo<ColDef<TreeRecord>[]>(() => {
    const cols: ColDef<TreeRecord>[] = [
      {
        field: 'id',
        headerName: 'Tree ID',
        pinned: 'left',
        editable: false,
        width: 120,
        cellClass: 'font-mono text-xs',
      },
      {
        field: 'speciesName',
        headerName: 'Species',
        editable: true,
        width: 200,
        cellClass: (p) => (!p.value ? 'flora-cell-missing' : ''),
      },
      {
        field: 'latitude',
        headerName: 'Latitude',
        editable: true,
        width: 130,
        cellDataType: 'number',
        cellClass: (p) => `font-mono text-xs ${p.value == null ? 'flora-cell-missing' : ''}`,
        valueFormatter: (p) => (p.value == null ? '' : Number(p.value).toFixed(6)),
      },
      {
        field: 'longitude',
        headerName: 'Longitude',
        editable: true,
        width: 130,
        cellDataType: 'number',
        cellClass: (p) => `font-mono text-xs ${p.value == null ? 'flora-cell-missing' : ''}`,
        valueFormatter: (p) => (p.value == null ? '' : Number(p.value).toFixed(6)),
      },
      {
        field: 'zoneName',
        headerName: 'Zone',
        editable: true,
        width: 140,
        cellClass: (p) => (!p.value ? 'flora-cell-missing' : ''),
      },
      {
        field: 'treeStatus',
        headerName: 'Status',
        editable: true,
        width: 110,
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: { values: ['', 'Existing', 'New'] },
      },
      {
        field: 'height',
        headerName: 'Height (m)',
        editable: true,
        width: 110,
        cellDataType: 'number',
        cellClass: (p) => (p.value == null ? 'flora-cell-missing' : ''),
      },
      {
        colId: 'mapped',
        headerName: 'Mapped',
        width: 100,
        editable: false,
        valueGetter: (p) => (p.data && isTreeMapped(p.data) ? 'Yes' : 'No'),
        cellClass: (p) => (p.value === 'No' ? 'text-danger font-semibold' : 'text-existing'),
      },
      {
        colId: 'complete',
        headerName: 'Complete',
        width: 100,
        editable: false,
        valueGetter: (p) => (p.data && isTreeComplete(p.data) ? 'Yes' : 'No'),
        cellClass: (p) => (p.value === 'No' ? 'text-flag font-semibold' : 'text-existing'),
      },
    ];

    for (const key of extraColumnKeys) {
      cols.push({
        colId: `extra:${key}`,
        headerName: key,
        editable: true,
        width: 140,
        valueGetter: (p) => p.data?.additionalFields[key] ?? '',
        // AG Grid *requires* this to actually write params.data to detect
        // the edit and report the right newValue (see the long comment on
        // updateTreeField in useFloraStore.ts for why). Undo safety comes
        // from onCellValueChanged passing e.oldValue through to
        // updateTreeExtraField, not from avoiding this mutation.
        valueSetter: (p) => {
          if (!p.data) return false;
          p.data.additionalFields = { ...p.data.additionalFields, [key]: p.newValue };
          return true;
        },
      });
    }

    cols.push({
      colId: 'actions',
      headerName: '',
      width: 70,
      editable: false,
      pinned: 'right',
      sortable: false,
      filter: false,
      cellRenderer: (p: { data?: TreeRecord }) =>
        p.data ? (
          <button
            type="button"
            className="rounded px-2 py-0.5 text-xs text-danger hover:bg-danger/10"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Delete ${p.data!.id}?\n\nThis will remove the tree from the current dataset.`)) {
                deleteTree(p.data!.id);
              }
            }}
          >
            Delete
          </button>
        ) : null,
    });

    return cols;
  }, [extraColumnKeys, deleteTree]);

  const getRowId = useCallback((params: GetRowIdParams<TreeRecord>) => params.data.id, []);

  const rowClassRules = useMemo(
    () => ({
      'flora-row-selected': (p: RowClassParams<TreeRecord>) => p.data?.id === selectedTreeId,
      'flora-row-unsaved': (p: RowClassParams<TreeRecord>) => Boolean(p.data?.isUnsaved),
    }),
    [selectedTreeId]
  );

  const onCellValueChanged = useCallback(
    (e: CellValueChangedEvent<TreeRecord>) => {
      if (!e.data) return;
      const field = e.colDef.field as keyof TreeRecord | undefined;
      if (!field) {
        // Extra/additionalFields column.
        const colId = e.column.getColId();
        if (!colId.startsWith('extra:')) return;
        const key = colId.slice('extra:'.length);
        updateTreeExtraField(e.data.id, key, e.oldValue, e.newValue);
        return;
      }
      updateTreeField(e.data.id, field, e.oldValue, e.newValue);
    },
    [updateTreeField, updateTreeExtraField]
  );

  const handleRowClicked = useCallback(
    (id: string) => {
      selectTree(id, 'grid');
    },
    [selectTree]
  );

  // Scroll to + flash the row when the map requests focus (marker click / Section 23).
  useEffect(() => {
    if (!selectedTreeId || !gridRef.current?.api) return;
    const api = gridRef.current.api;
    const node = api.getRowNode(selectedTreeId);
    if (node) {
      api.ensureNodeVisible(node, 'middle');
      api.flashCells({ rowNodes: [node] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridFocusNonce]);

  const handleAddRow = useCallback(() => {
    const record = addTree({ isUnsaved: true, treeStatus: 'New' });
    setTimeout(() => {
      const node = gridRef.current?.api?.getRowNode(record.id);
      if (node) gridRef.current?.api?.ensureNodeVisible(node, 'middle');
    }, 0);
  }, [addTree]);

  const handleDeleteSelected = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    const selected = api.getSelectedRows();
    if (selected.length === 0) return;
    if (
      window.confirm(
        `Delete ${selected.length} selected tree${selected.length > 1 ? 's' : ''}?\n\nThis will remove them from the current dataset.`
      )
    ) {
      selected.forEach((t) => deleteTree(t.id));
    }
  }, [deleteTree]);

  const getVisibleColumnFields = useCallback((): (keyof TreeRecord | string)[] => {
    const api = gridRef.current?.api;
    if (!api) return CANONICAL_FIELDS;
    const fields = api
      .getAllDisplayedColumns()
      .map((c) => c.getColDef().field ?? c.getColId())
      .filter((f) => f !== 'id' && f !== 'actions' && f !== 'mapped' && f !== 'complete');
    return fields.length ? fields : CANONICAL_FIELDS;
  }, []);

  // Ctrl+D — fill down. With multiple rows checkbox-selected, copies the
  // topmost selected row's species/zone/status/height/extra-columns into
  // every other selected row (coordinates are deliberately excluded from
  // this bulk path — identical coordinates across many different trees is
  // almost never intended). With just a single cell focused, copies the
  // value from the row directly above into that one cell/column, including
  // coordinates — the classic single-cell spreadsheet fill-down.
  const handleFillDown = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    const selectedRows = api.getSelectedRows();

    if (selectedRows.length > 1) {
      const source = selectedRows[0];
      selectedRows.slice(1).forEach((row) => {
        updateTree(row.id, {
          speciesName: source.speciesName,
          zoneName: source.zoneName,
          treeStatus: source.treeStatus,
          height: source.height,
          additionalFields: { ...source.additionalFields },
        });
      });
      return;
    }

    const focused = focusedCellRef.current;
    if (!focused.rowId) return;
    const node = api.getRowNode(focused.rowId);
    if (!node || node.rowIndex == null || node.rowIndex === 0) return;
    const aboveNode = api.getDisplayedRowAtIndex(node.rowIndex - 1);
    if (!aboveNode?.data) return;

    const field = getVisibleColumnFields()[focused.colIndex];
    if (!field || field === 'id') return;

    if (typeof field === 'string' && field.startsWith('extra:')) {
      const key = field.slice('extra:'.length);
      const current = useFloraStore.getState().trees.find((t) => t.id === focused.rowId);
      const merged = { ...(current?.additionalFields ?? {}), [key]: aboveNode.data.additionalFields[key] ?? null };
      updateTree(focused.rowId, { additionalFields: merged });
    } else {
      updateTree(focused.rowId, {
        [field]: aboveNode.data[field as keyof TreeRecord],
      } as Partial<TreeRecord>);
    }
  }, [updateTree, getVisibleColumnFields]);

  // Ctrl+Shift+D — duplicate the checkbox-selected rows (or just the
  // focused row if none are checked) as new trees at the same coordinates,
  // handy for quickly placing several similar trees near one another before
  // dragging each marker into its exact spot.
  const handleDuplicateSelected = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    const selected = api.getSelectedRows();
    const source =
      selected.length > 0
        ? selected
        : allTrees.filter((t) => t.id === focusedCellRef.current.rowId);
    if (source.length === 0) return;

    source.forEach((t) => {
      addTree({
        speciesName: t.speciesName,
        latitude: t.latitude,
        longitude: t.longitude,
        zoneName: t.zoneName,
        treeStatus: t.treeStatus,
        height: t.height,
        additionalFields: { ...t.additionalFields },
        isUnsaved: true,
      });
    });
  }, [addTree, allTrees]);

  // Delete / Backspace — clears the focused cell's value (only when not
  // actively typing in a cell editor; see the isEditing guard in
  // onCellKeyDown below).
  const handleClearFocusedCell = useCallback(() => {
    const focused = focusedCellRef.current;
    if (!focused.rowId) return;
    const field = getVisibleColumnFields()[focused.colIndex];
    if (!field || field === 'id') return;

    if (typeof field === 'string' && field.startsWith('extra:')) {
      const key = field.slice('extra:'.length);
      const current = useFloraStore.getState().trees.find((t) => t.id === focused.rowId);
      if (!current) return;
      const merged = { ...current.additionalFields, [key]: null };
      updateTree(focused.rowId, { additionalFields: merged });
      return;
    }

    switch (field) {
      case 'speciesName':
      case 'zoneName':
        updateTree(focused.rowId, { [field]: '' } as Partial<TreeRecord>);
        break;
      case 'treeStatus':
        updateTree(focused.rowId, { treeStatus: '' });
        break;
      case 'latitude':
      case 'longitude':
      case 'height':
        updateTree(focused.rowId, { [field]: null } as Partial<TreeRecord>);
        break;
      default:
        break;
    }
  }, [updateTree, getVisibleColumnFields]);

  // Shared by both keyboard-shortcut entry points below. AG Grid's own
  // onCellKeyDown *should* be sufficient on its own, but AG Grid handles a
  // number of keys (Delete, Ctrl+A, arrow navigation) internally and isn't
  // always reliable about which keys still reach app-level handlers versus
  // ones it treats as fully "its own" — so shortcuts are wired up through
  // two independent paths (this function, called from both) rather than
  // trusting a single one. Whichever fires first calls preventDefault();
  // the second checks defaultPrevented and no-ops, so an action never runs
  // twice for one keypress.
  const handleShortcutKeyDown = useCallback(
    (native: KeyboardEvent) => {
      if (native.defaultPrevented) return; // already handled by the other path
      const api = gridRef.current?.api;
      if (!api) return;
      if (api.getEditingCells().length > 0) return; // let normal typing happen

      const ctrlOrCmd = native.ctrlKey || native.metaKey;
      const key = native.key.toLowerCase();

      if (ctrlOrCmd && key === 'd' && native.shiftKey) {
        native.preventDefault();
        handleDuplicateSelected();
      } else if (ctrlOrCmd && key === 'd') {
        native.preventDefault();
        handleFillDown();
      } else if (ctrlOrCmd && key === 'a') {
        native.preventDefault();
        api.selectAll();
      } else if (key === 'delete' || key === 'backspace') {
        native.preventDefault();
        handleClearFocusedCell();
      }
    },
    [handleFillDown, handleDuplicateSelected, handleClearFocusedCell]
  );

  // Path 1: AG Grid's own per-cell keydown hook.
  const onCellKeyDown = useCallback(
    (e: CellKeyDownEvent<TreeRecord>) => {
      const native = e.event as KeyboardEvent | undefined;
      if (!native) return;
      handleShortcutKeyDown(native);
    },
    [handleShortcutKeyDown]
  );

  // Path 2: a plain DOM listener on the grid's wrapping container, as a
  // fallback in case AG Grid's internal keyboard handling ever swallows a
  // key before onCellKeyDown sees it. Only active while the spreadsheet
  // panel actually contains focus, so it can never steal Escape/Ctrl+D/etc.
  // from the map or the rest of the app.
  const gridContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;
    function handle(e: KeyboardEvent) {
      if (!container!.contains(document.activeElement)) return;
      handleShortcutKeyDown(e);
    }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [handleShortcutKeyDown]);

  // Excel-style multi-cell/multi-row paste (Section 17/18) — AG Grid Community
  // doesn't ship range-selection clipboard handling, so we read the browser
  // clipboard ourselves anchored at the last focused cell and hand tab/newline
  // separated rows to the store, which creates new rows as needed. Triggers
  // on either multiple rows (newline-separated, even a single copied column —
  // e.g. just a column of coordinates) or multiple columns (tab-separated);
  // a genuine single-cell paste falls through to the normal edit path.
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData('text/plain');
      if (!text) return;

      const rows = text
        .replace(/\r/g, '')
        .split('\n')
        .filter((r) => r.length > 0)
        .map((r) => r.split('\t'));

      const isMultiRow = rows.length > 1;
      const isMultiCol = rows.some((r) => r.length > 1);
      if (!isMultiRow && !isMultiCol) return; // single cell — let the normal edit path handle it

      e.preventDefault();

      const fields = getVisibleColumnFields().slice(
        focusedCellRef.current.colIndex,
        focusedCellRef.current.colIndex + (rows[0]?.length ?? 0)
      );

      bulkPasteRows(focusedCellRef.current.rowId, rows, fields.length ? fields : CANONICAL_FIELDS);
    },
    [bulkPasteRows, getVisibleColumnFields]
  );

  if (collapsed) {
    return (
      <div className="flex h-9 items-center justify-between border-t border-hairline bg-bark-850 px-4">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="font-sans text-xs font-medium text-paper-200 hover:text-flag"
        >
          ▲ Spreadsheet ({allTrees.length} records)
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col border-t border-hairline bg-paper-100" style={{ height }}>
      <div
        onMouseDown={onStartResize}
        className="h-1.5 shrink-0 cursor-row-resize bg-bark-700 hover:bg-flag"
        title="Drag to resize"
      />
      <div className="flex shrink-0 items-center justify-between border-b border-hairline bg-bark-850 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="font-sans text-xs font-medium text-paper-200 hover:text-flag"
          >
            ▼ Spreadsheet
          </button>
          <span className="font-mono text-[11px] text-bark-500">{trees.length} of {allTrees.length} rows</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={quickFilter}
            onChange={(e) => setQuickFilter(e.target.value)}
            placeholder="Quick filter rows…"
            className="w-52 rounded border border-hairline bg-bark-900 px-2 py-1 font-sans text-xs text-paper-100 placeholder:text-bark-500 focus:border-flag focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddRow}
            className="rounded border border-hairline bg-bark-800 px-2.5 py-1 font-sans text-xs font-medium text-paper-100 hover:bg-bark-700"
          >
            + Add Row
          </button>
          <button
            type="button"
            onClick={handleDuplicateSelected}
            title="Ctrl+Shift+D"
            className="rounded border border-hairline bg-bark-800 px-2.5 py-1 font-sans text-xs font-medium text-paper-100 hover:bg-bark-700"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={handleDeleteSelected}
            className="rounded border border-hairline bg-bark-800 px-2.5 py-1 font-sans text-xs font-medium text-danger hover:bg-bark-700"
          >
            Delete Selected
          </button>
        </div>
      </div>
      <div
        ref={gridContainerRef}
        className="ag-theme-quartz flora-grid flex-1"
        onPasteCapture={handlePaste}
      >
        <AgGridReact<TreeRecord>
          ref={gridRef}
          rowData={trees}
          columnDefs={columnDefs}
          getRowId={getRowId}
          rowSelection={{ mode: 'multiRow', checkboxes: true, headerCheckbox: true }}
          quickFilterText={quickFilter}
          onCellValueChanged={onCellValueChanged}
          onCellKeyDown={onCellKeyDown}
          onRowClicked={(e) => e.data && handleRowClicked(e.data.id)}
          onCellFocused={(e) => {
            if (e.rowIndex == null) return;
            const rowNode = gridRef.current?.api?.getDisplayedRowAtIndex(e.rowIndex);
            focusedCellRef.current = {
              rowId: rowNode?.data?.id ?? null,
              colIndex: typeof e.column === 'object' && e.column
                ? gridRef.current?.api?.getAllDisplayedColumns().findIndex((c) => c === e.column) ?? 0
                : 0,
            };
          }}
          rowClassRules={rowClassRules}
          animateRows={false}
          rowBuffer={20}
          suppressColumnVirtualisation={false}
          defaultColDef={{
            resizable: true,
            sortable: true,
            filter: true,
            // No custom valueSetter here on purpose. AG Grid's default
            // field-bound valueSetter mutates params.data[field] directly —
            // an earlier revision tried to prevent that (to protect undo
            // history) with a no-op valueSetter, but AG Grid re-reads the
            // field from data *after* calling valueSetter to decide what
            // changed; a no-op setter makes it conclude nothing changed and
            // silently drop the edit. That was the "location cannot be
            // edited" bug. The mutation is allowed to happen again; undo
            // safety instead comes from onCellValueChanged passing AG
            // Grid's own pre-mutation e.oldValue into updateTreeField /
            // updateTreeExtraField (see useFloraStore.ts), which is
            // correct regardless of what the grid does to the object.
          }}
        />
      </div>
    </div>
  );
}


