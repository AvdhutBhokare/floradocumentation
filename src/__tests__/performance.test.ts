import { describe, it, expect } from 'vitest';
import { buildImportPreview, rowsToTreeRecords } from '../services/excel/importExcel';
import { treesToRows } from '../services/excel/exportExcel';
import { useFloraStore } from '../store/useFloraStore';

function generateRows(count: number) {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      'Tree Species Name': `Species ${i % 50}`,
      Latitude: 18.5 + Math.random() * 0.02,
      Longitude: 73.85 + Math.random() * 0.02,
      'Zone Name': `Zone ${String.fromCharCode(65 + (i % 12))}`,
      'Existing Tree / New Tree': i % 5 === 0 ? 'New' : 'Existing',
      Height: 2 + Math.random() * 15,
    });
  }
  return rows;
}

describe('performance at scale (target: 10,000+ records, no lag)', () => {
  it('imports 10,000 rows into TreeRecords within a reasonable time budget', () => {
    const rows = generateRows(10000);
    const headers = Object.keys(rows[0]);

    const t0 = performance.now();
    const preview = buildImportPreview('large.xlsx', headers, rows);
    const trees = rowsToTreeRecords(preview, new Set());
    const t1 = performance.now();

    expect(trees).toHaveLength(10000);
    expect(new Set(trees.map((t) => t.id)).size).toBe(10000); // all ids unique
    expect(t1 - t0).toBeLessThan(5000); // generous CI-safe budget

    const t2 = performance.now();
    const exported = treesToRows(trees);
    const t3 = performance.now();
    expect(exported).toHaveLength(10000);
    expect(t3 - t2).toBeLessThan(5000);
  });

  it('store operations remain correct with a 10,000-record dataset loaded', () => {
    useFloraStore.setState({ trees: [], undoStack: [], redoStack: [], selectedTreeId: null });
    const rows = generateRows(10000);
    const headers = Object.keys(rows[0]);
    const preview = buildImportPreview('large.xlsx', headers, rows);

    const t0 = performance.now();
    useFloraStore.getState().importFromPreview(preview, 'replace');
    const t1 = performance.now();

    expect(useFloraStore.getState().trees).toHaveLength(10000);
    expect(t1 - t0).toBeLessThan(5000);

    // A single edit after a large import should still be fast and correct —
    // this is the operation that must not "re-render/re-diff everything".
    const targetId = useFloraStore.getState().trees[5000].id;
    const t2 = performance.now();
    useFloraStore.getState().updateTree(targetId, { speciesName: 'Updated At Scale' });
    const t3 = performance.now();

    expect(useFloraStore.getState().trees.find((t) => t.id === targetId)?.speciesName).toBe(
      'Updated At Scale'
    );
    expect(t3 - t2).toBeLessThan(200);
  });

  it('regression: deleting one tree out of 10,000 removes exactly that one tree', () => {
    // Directly guards against the reported bug where removing a single
    // marker/row emptied the entire dataset/map.
    useFloraStore.setState({ trees: [], undoStack: [], redoStack: [], selectedTreeId: null });
    const rows = generateRows(10000);
    const headers = Object.keys(rows[0]);
    const preview = buildImportPreview('large.xlsx', headers, rows);
    useFloraStore.getState().importFromPreview(preview, 'replace');

    const allIds = useFloraStore.getState().trees.map((t) => t.id);
    expect(allIds).toHaveLength(10000);
    const victimId = allIds[4321];

    const t0 = performance.now();
    useFloraStore.getState().deleteTree(victimId);
    const t1 = performance.now();

    const remaining = useFloraStore.getState().trees;
    expect(remaining).toHaveLength(9999);
    expect(remaining.some((t) => t.id === victimId)).toBe(false);
    // Every other tree must still be present, untouched.
    const remainingIds = new Set(remaining.map((t) => t.id));
    for (const id of allIds) {
      if (id === victimId) continue;
      expect(remainingIds.has(id)).toBe(true);
    }
    expect(t1 - t0).toBeLessThan(200);
  });

  it('undo/redo stay fast at 10,000-record scale (reference-based history, not full clones)', () => {
    useFloraStore.setState({ trees: [], undoStack: [], redoStack: [], selectedTreeId: null });
    const rows = generateRows(10000);
    const headers = Object.keys(rows[0]);
    const preview = buildImportPreview('large.xlsx', headers, rows);
    useFloraStore.getState().importFromPreview(preview, 'replace');

    const targetId = useFloraStore.getState().trees[10].id;

    // Simulate a realistic burst of spreadsheet editing at scale.
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) {
      useFloraStore.getState().updateTree(targetId, { height: i });
    }
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(500); // 30 edits over 10k records should be near-instant

    expect(useFloraStore.getState().trees.find((t) => t.id === targetId)?.height).toBe(29);

    const t2 = performance.now();
    useFloraStore.getState().undo();
    const t3 = performance.now();
    expect(t3 - t2).toBeLessThan(50);
    expect(useFloraStore.getState().trees.find((t) => t.id === targetId)?.height).toBe(28);
    expect(useFloraStore.getState().trees).toHaveLength(10000);

    const t4 = performance.now();
    useFloraStore.getState().redo();
    const t5 = performance.now();
    expect(t5 - t4).toBeLessThan(50);
    expect(useFloraStore.getState().trees.find((t) => t.id === targetId)?.height).toBe(29);
  });

  it('bulk-pastes hundreds of rows into a 10,000-record dataset quickly', () => {
    useFloraStore.setState({ trees: [], undoStack: [], redoStack: [], selectedTreeId: null });
    const rows = generateRows(10000);
    const headers = Object.keys(rows[0]);
    const preview = buildImportPreview('large.xlsx', headers, rows);
    useFloraStore.getState().importFromPreview(preview, 'replace');

    const pasteRows = Array.from({ length: 300 }, (_, i) => [
      `Pasted Species ${i}`,
      String(18.5 + i * 0.0001),
      String(73.85 + i * 0.0001),
      'Zone Pasted',
      'New',
      '5',
    ]);

    const t0 = performance.now();
    useFloraStore
      .getState()
      .bulkPasteRows(null, pasteRows, ['speciesName', 'latitude', 'longitude', 'zoneName', 'treeStatus', 'height']);
    const t1 = performance.now();

    expect(useFloraStore.getState().trees).toHaveLength(10300);
    expect(t1 - t0).toBeLessThan(1000);
  });
});
