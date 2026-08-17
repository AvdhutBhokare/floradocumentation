import { describe, it, expect, beforeEach } from 'vitest';
import { useFloraStore } from '../store/useFloraStore';
import type { ImportPreviewResult } from '../types/tree';

function resetStore() {
  useFloraStore.setState({
    trees: [],
    zones: [],
    zoneReview: [],
    selectedTreeId: null,
    selectedZoneName: null,
    undoStack: [],
    redoStack: [],
    dirty: false,
  });
}

beforeEach(() => {
  resetStore();
});

describe('addTree / single source of truth (Section 16/48)', () => {
  it('creates a tree with a stable generated id and marks it selected', () => {
    const record = useFloraStore.getState().addTree({
      speciesName: 'Ficus religiosa',
      latitude: 18.522,
      longitude: 73.858,
      treeStatus: 'New',
    });
    expect(record.id).toBe('TREE-0001');
    expect(useFloraStore.getState().trees).toHaveLength(1);
    expect(useFloraStore.getState().selectedTreeId).toBe(record.id);
  });

  it('auto-detects zone from coordinates when zone is not provided', () => {
    useFloraStore.setState({
      zones: [
        {
          id: 'z1',
          name: 'Zone A',
          color: '#4C8B5B',
          sourceFile: 'test.kml',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [73.856, 18.52],
                [73.858, 18.52],
                [73.858, 18.522],
                [73.856, 18.522],
                [73.856, 18.52],
              ],
            ],
          },
        },
      ],
    });
    const record = useFloraStore.getState().addTree({ latitude: 18.521, longitude: 73.857 });
    expect(record.zoneName).toBe('Zone A');
  });
});

describe('spreadsheet -> map synchronization (Section 19)', () => {
  it('updateTree reflects immediately in the single trees array', () => {
    const { addTree, updateTree } = useFloraStore.getState();
    const record = addTree({ speciesName: 'Neem', latitude: 18.52, longitude: 73.86 });
    updateTree(record.id, { speciesName: 'Ficus religiosa' });
    const updated = useFloraStore.getState().trees.find((t) => t.id === record.id);
    expect(updated?.speciesName).toBe('Ficus religiosa');
  });

  it('editing coordinates updates the same record markers read from (no separate copy)', () => {
    const { addTree, updateTree } = useFloraStore.getState();
    const record = addTree({ latitude: 18.5204, longitude: 73.8567 });
    updateTree(record.id, { latitude: 18.5215, longitude: 73.8592 });
    const updated = useFloraStore.getState().trees.find((t) => t.id === record.id);
    expect(updated?.latitude).toBeCloseTo(18.5215);
    expect(updated?.longitude).toBeCloseTo(73.8592);
  });

  it('clearing coordinates leaves the row but it becomes unmapped', () => {
    const { addTree, updateTree } = useFloraStore.getState();
    const record = addTree({ latitude: 18.52, longitude: 73.86 });
    updateTree(record.id, { latitude: null, longitude: null });
    const trees = useFloraStore.getState().trees;
    expect(trees).toHaveLength(1);
    expect(trees[0].latitude).toBeNull();
  });
});

describe('map -> spreadsheet synchronization (Section 20/21)', () => {
  it('dragging a marker (updateTreeCoordinates) updates lat/lng without creating a duplicate row', () => {
    const { addTree, updateTreeCoordinates } = useFloraStore.getState();
    const record = addTree({ latitude: 18.5204, longitude: 73.8567 });
    updateTreeCoordinates(record.id, 18.52095, 73.85725);
    const trees = useFloraStore.getState().trees;
    expect(trees).toHaveLength(1);
    expect(trees[0].latitude).toBeCloseTo(18.52095);
    expect(trees[0].longitude).toBeCloseTo(73.85725);
  });
});

describe('deleteTree', () => {
  it('removes the tree and clears selection if it was selected', () => {
    const { addTree, deleteTree } = useFloraStore.getState();
    const record = addTree({});
    deleteTree(record.id);
    expect(useFloraStore.getState().trees).toHaveLength(0);
    expect(useFloraStore.getState().selectedTreeId).toBeNull();
  });
});

describe('undo / redo (Section 36)', () => {
  it('undo reverts the last data-changing action', () => {
    const { addTree, updateTree, undo } = useFloraStore.getState();
    const record = addTree({ speciesName: 'Original' });
    updateTree(record.id, { speciesName: 'Changed' });
    expect(useFloraStore.getState().trees[0].speciesName).toBe('Changed');
    undo();
    expect(useFloraStore.getState().trees[0].speciesName).toBe('Original');
  });

  it('redo re-applies an undone action', () => {
    const { addTree, updateTree, undo, redo } = useFloraStore.getState();
    const record = addTree({ speciesName: 'Original' });
    updateTree(record.id, { speciesName: 'Changed' });
    undo();
    redo();
    expect(useFloraStore.getState().trees[0].speciesName).toBe('Changed');
  });

  it('a new action after undo clears the redo stack', () => {
    const { addTree, updateTree, undo } = useFloraStore.getState();
    const record = addTree({ speciesName: 'A' });
    updateTree(record.id, { speciesName: 'B' });
    undo();
    updateTree(record.id, { speciesName: 'C' });
    expect(useFloraStore.getState().redoStack).toHaveLength(0);
  });

  it('regression: history snapshots are reference-based, so non-grid callers must never mutate TreeRecord objects in place', () => {
    // updateTree() (used by TreeFormModal, paste, fill-down, duplicate —
    // anything that isn't a raw AG Grid cell edit) relies on the trees
    // array never being mutated in place, since undo snapshots are stored
    // by reference for performance at 10,000+ records rather than deep
    // cloned. This proves that invariant holds for a plain updateTree call.
    // (AG Grid cell edits go through the separate updateTreeField /
    // updateTreeExtraField actions below instead, which are safe even when
    // AG Grid's own default valueSetter mutates the object first — see the
    // long comment on updateTreeField in useFloraStore.ts.)
    const { addTree, updateTree } = useFloraStore.getState();
    const record = addTree({ speciesName: 'Before Edit', height: 5 });

    updateTree(record.id, { speciesName: 'After Edit' });

    const snapshotBeforeThisEdit =
      useFloraStore.getState().undoStack[useFloraStore.getState().undoStack.length - 1];
    const snapshotTree = snapshotBeforeThisEdit.trees.find((t) => t.id === record.id);
    expect(snapshotTree?.speciesName).toBe('Before Edit');

    useFloraStore.getState().undo();
    expect(useFloraStore.getState().trees.find((t) => t.id === record.id)?.speciesName).toBe(
      'Before Edit'
    );
  });

  it('updateTreeField (used by grid cell edits) restores the exact pre-edit value on undo even when the object was mutated first', () => {
    // Simulates exactly what AG Grid's default (mutating) valueSetter does
    // in production: writes the new value onto the live object *before*
    // our store action runs. AG Grid separately reports the true
    // pre-mutation oldValue via its change event, which is what
    // onCellValueChanged passes through here — that's what keeps undo
    // correct regardless of the mutation.
    const { addTree, updateTreeField } = useFloraStore.getState();
    const record = addTree({ speciesName: 'Neem', latitude: 18.5204, longitude: 73.8567 });

    const liveObject = useFloraStore.getState().trees.find((t) => t.id === record.id)!;
    liveObject.latitude = 19.999; // simulates AG Grid's in-place mutation

    updateTreeField(record.id, 'latitude', 18.5204, 19.999);
    expect(useFloraStore.getState().trees.find((t) => t.id === record.id)?.latitude).toBe(19.999);

    useFloraStore.getState().undo();
    expect(useFloraStore.getState().trees.find((t) => t.id === record.id)?.latitude).toBe(18.5204);
  });

  it('updateTreeExtraField edits additionalFields and undo restores the prior value', () => {
    const { addTree, updateTreeExtraField } = useFloraStore.getState();
    const record = addTree({ speciesName: 'Neem', additionalFields: { Remarks: 'Healthy' } });

    updateTreeExtraField(record.id, 'Remarks', 'Healthy', 'Leaning slightly north');
    expect(
      useFloraStore.getState().trees.find((t) => t.id === record.id)?.additionalFields.Remarks
    ).toBe('Leaning slightly north');

    useFloraStore.getState().undo();
    expect(
      useFloraStore.getState().trees.find((t) => t.id === record.id)?.additionalFields.Remarks
    ).toBe('Healthy');
  });
});

describe('import replace vs add (Section 39/40)', () => {
  function fakePreview(): ImportPreviewResult {
    return {
      fileName: 'test.xlsx',
      totalRows: 1,
      validCoordinates: 1,
      invalidCoordinates: 0,
      missingCoordinates: 0,
      detectedColumns: {
        speciesName: 'Species',
        latitude: 'Latitude',
        longitude: 'Longitude',
        zoneName: 'Zone',
        treeStatus: 'Status',
        height: 'Height',
      },
      allColumns: ['Species', 'Latitude', 'Longitude', 'Zone', 'Status', 'Height'],
      rows: [
        {
          rowIndex: 0,
          raw: { Species: 'Neem', Latitude: 18.52, Longitude: 73.86, Zone: 'Zone A', Status: 'Existing', Height: 5 },
          latitude: 18.52,
          longitude: 73.86,
          coordinateState: 'valid',
        },
      ],
    };
  }

  it('replace mode discards existing records', () => {
    const { addTree, importFromPreview } = useFloraStore.getState();
    addTree({ speciesName: 'Old record' });
    importFromPreview(fakePreview(), 'replace');
    const trees = useFloraStore.getState().trees;
    expect(trees).toHaveLength(1);
    expect(trees[0].speciesName).toBe('Neem');
  });

  it('add mode appends to existing records without overwriting them', () => {
    const { addTree, importFromPreview } = useFloraStore.getState();
    addTree({ speciesName: 'Old record' });
    importFromPreview(fakePreview(), 'add');
    const trees = useFloraStore.getState().trees;
    expect(trees).toHaveLength(2);
    expect(trees.some((t) => t.speciesName === 'Old record')).toBe(true);
    expect(trees.some((t) => t.speciesName === 'Neem')).toBe(true);
  });
});

describe('bulkPasteRows (Section 17/18)', () => {
  it('creates new rows for pasted data with no existing anchor row', () => {
    const { bulkPasteRows } = useFloraStore.getState();
    bulkPasteRows(
      null,
      [
        ['Ficus religiosa', '18.5204', '73.8567', 'Zone A', 'Existing', '10'],
        ['Neem', '18.5211', '73.8571', 'Zone A', 'New', '5'],
      ],
      ['speciesName', 'latitude', 'longitude', 'zoneName', 'treeStatus', 'height']
    );
    const trees = useFloraStore.getState().trees;
    expect(trees).toHaveLength(2);
    expect(trees[0].speciesName).toBe('Ficus religiosa');
    expect(trees[0].latitude).toBeCloseTo(18.5204);
    expect(trees[1].speciesName).toBe('Neem');
  });

  it('overwrites existing rows starting at the anchor row rather than duplicating them', () => {
    const { addTree, bulkPasteRows } = useFloraStore.getState();
    const record = addTree({ speciesName: 'Placeholder' });
    bulkPasteRows(record.id, [['Updated Species', '18.5', '73.8']], ['speciesName', 'latitude', 'longitude']);
    const trees = useFloraStore.getState().trees;
    expect(trees).toHaveLength(1);
    expect(trees[0].speciesName).toBe('Updated Species');
  });

  it('regression: pasting a single copied column of many locations fills that many rows', () => {
    // Mirrors copying just a "Latitude" column (many rows, one column, no
    // tab characters) from Excel and pasting starting at a fresh anchor —
    // the Spreadsheet component's isMultiRow check is what routes this
    // through bulkPasteRows instead of a single-cell edit; this test
    // exercises the store side of that path directly.
    const { bulkPasteRows } = useFloraStore.getState();
    const singleColumnRows = [['18.5201'], ['18.5202'], ['18.5203'], ['18.5204']];
    bulkPasteRows(null, singleColumnRows, ['latitude']);
    const trees = useFloraStore.getState().trees;
    expect(trees).toHaveLength(4);
    expect(trees.map((t) => t.latitude)).toEqual([18.5201, 18.5202, 18.5203, 18.5204]);
    // Only latitude was pasted — every other field stays at its default.
    expect(trees.every((t) => t.speciesName === '')).toBe(true);
  });
});
