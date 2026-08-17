import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildImportPreview, rowsToTreeRecords, readWorkbookRows, ExcelImportError } from '../services/excel/importExcel';
import { treesToRows } from '../services/excel/exportExcel';

function makeXlsxFile(rows: Record<string, unknown>[], name = 'test.xlsx'): File {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new File([buf], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const SAMPLE_ROWS = [
  {
    'Tree Species Name': 'Azadirachta indica',
    Latitude: 18.5204,
    Longitude: 73.8567,
    'Zone Name': 'Zone A',
    'Existing Tree / New Tree': 'Existing',
    Height: 8.5,
    Remarks: 'Near boundary marker',
    Surveyor: 'A. Kulkarni',
    DBH: 40,
  },
  {
    'Tree Species Name': 'Mangifera indica',
    Latitude: 18.5211,
    Longitude: 73.8571,
    'Zone Name': 'Zone A',
    'Existing Tree / New Tree': 'New',
    Height: 4.2,
    Remarks: '',
    Surveyor: 'S. Joshi',
    DBH: 12,
  },
];

describe('readWorkbookRows', () => {
  it('reads headers and rows from a real xlsx workbook', async () => {
    const file = makeXlsxFile(SAMPLE_ROWS);
    const { headers, rows } = await readWorkbookRows(file);
    expect(headers).toContain('Tree Species Name');
    expect(headers).toContain('Latitude');
    expect(rows).toHaveLength(2);
  });

  it('rejects an empty workbook instead of crashing (Section 54)', async () => {
    const file = makeXlsxFile([]);
    await expect(readWorkbookRows(file)).rejects.toThrow(ExcelImportError);
  });
});

describe('full import -> TreeRecord -> export round trip', () => {
  it('preserves every original column, including ones not used by the app (Section 6/41)', async () => {
    const file = makeXlsxFile(SAMPLE_ROWS);
    const { headers, rows } = await readWorkbookRows(file);
    const preview = buildImportPreview(file.name, headers, rows);

    expect(preview.totalRows).toBe(2);
    expect(preview.validCoordinates).toBe(2);
    expect(preview.invalidCoordinates).toBe(0);
    expect(preview.missingCoordinates).toBe(0);

    const trees = rowsToTreeRecords(preview, new Set());
    expect(trees).toHaveLength(2);

    // Canonical fields correctly extracted
    expect(trees[0].speciesName).toBe('Azadirachta indica');
    expect(trees[0].latitude).toBeCloseTo(18.5204);
    expect(trees[0].longitude).toBeCloseTo(73.8567);
    expect(trees[0].zoneName).toBe('Zone A');
    expect(trees[0].treeStatus).toBe('Existing');
    expect(trees[0].height).toBeCloseTo(8.5);

    // Extra columns preserved verbatim
    expect(trees[0].additionalFields.Remarks).toBe('Near boundary marker');
    expect(trees[0].additionalFields.Surveyor).toBe('A. Kulkarni');
    expect(trees[0].additionalFields.DBH).toBe(40);

    // Stable, unique Tree IDs assigned
    expect(trees[0].id).toMatch(/^TREE-\d{4}$/);
    expect(trees[0].id).not.toBe(trees[1].id);

    // Export round-trip: every original column name reappears in the exported rows
    const exportedRows = treesToRows(trees);
    const exportedColumns = Object.keys(exportedRows[0]);
    for (const originalCol of ['Remarks', 'Surveyor', 'DBH']) {
      expect(exportedColumns).toContain(originalCol);
    }
    expect(exportedRows[0].Remarks).toBe('Near boundary marker');
    expect(exportedRows[0]['Tree ID']).toBe(trees[0].id);
  });

  it('flags out-of-range and missing coordinates without dropping the row (Section 8/32)', async () => {
    const badRows = [
      ...SAMPLE_ROWS,
      { 'Tree Species Name': 'Bad Lat', Latitude: 200, Longitude: 73.86, 'Zone Name': 'Zone A' },
      { 'Tree Species Name': 'No Coords', Latitude: '', Longitude: '', 'Zone Name': 'Zone A' },
    ];
    const file = makeXlsxFile(badRows);
    const { headers, rows } = await readWorkbookRows(file);
    const preview = buildImportPreview(file.name, headers, rows);

    expect(preview.totalRows).toBe(4);
    expect(preview.validCoordinates).toBe(2);
    expect(preview.invalidCoordinates).toBe(1);
    expect(preview.missingCoordinates).toBe(1);

    // All 4 rows still convert to TreeRecords — bad data doesn't crash import.
    const trees = rowsToTreeRecords(preview, new Set());
    expect(trees).toHaveLength(4);
  });

  it('respects a manual column-mapping override (Section 7)', async () => {
    const oddRows = [{ ColA: 'Ficus religiosa', ColB: 18.522, ColC: 73.858 }];
    const file = makeXlsxFile(oddRows);
    const { headers, rows } = await readWorkbookRows(file);

    // Automatic detection won't find these arbitrarily-named columns...
    const autoPreview = buildImportPreview(file.name, headers, rows);
    expect(autoPreview.detectedColumns.speciesName).toBeUndefined();

    // ...but manual override should work.
    const manualPreview = buildImportPreview(file.name, headers, rows, {
      speciesName: 'ColA',
      latitude: 'ColB',
      longitude: 'ColC',
    });
    expect(manualPreview.validCoordinates).toBe(1);
    const trees = rowsToTreeRecords(manualPreview, new Set());
    expect(trees[0].speciesName).toBe('Ficus religiosa');
  });

  it('generates new unique ids that continue after existing ids on merge-import (Section 40)', async () => {
    const file = makeXlsxFile(SAMPLE_ROWS);
    const { headers, rows } = await readWorkbookRows(file);
    const preview = buildImportPreview(file.name, headers, rows);
    const trees = rowsToTreeRecords(preview, new Set(['TREE-0001', 'TREE-0002', 'TREE-0005']));
    expect(trees[0].id).toBe('TREE-0006');
    expect(trees[1].id).toBe('TREE-0007');
  });
});
