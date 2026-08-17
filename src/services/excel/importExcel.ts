import * as XLSX from 'xlsx';
import { detectColumns } from './columnDetection';
import { parseCoordinateValue, validateCoordinatePair } from '../../utils/coordinates';
import type {
  ColumnMapping,
  ImportPreviewResult,
  ImportPreviewRow,
  TreeRecord,
  TreeStatus,
} from '../../types/tree';
import { nextTreeIdBatch } from '../../utils/ids';

export class ExcelImportError extends Error {}

/** Reads the first worksheet of an xlsx/xls/csv File into an array of row objects. */
export async function readWorkbookRows(
  file: File
): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const buffer = await file.arrayBuffer();
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  } catch {
    throw new ExcelImportError(
      `Could not read "${file.name}". The file may be corrupted or not a valid Excel/CSV file.`
    );
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new ExcelImportError(`"${file.name}" does not contain any worksheets.`);
  }
  const sheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: true,
  });

  if (json.length === 0) {
    throw new ExcelImportError(`"${file.name}" is empty — no data rows were found.`);
  }

  const headers = Object.keys(json[0]);
  if (headers.length === 0) {
    throw new ExcelImportError(`"${file.name}" has no detectable column headers.`);
  }

  return { headers, rows: json };
}

/** Builds an import preview (Section 8 of spec) without mutating app state. */
export function buildImportPreview(
  fileName: string,
  headers: string[],
  rows: Record<string, unknown>[],
  overrideMapping?: ColumnMapping
): ImportPreviewResult {
  const detection = detectColumns(headers);
  const mapping: ColumnMapping = { ...detection.mapping, ...overrideMapping };

  let valid = 0;
  let invalid = 0;
  let missing = 0;

  const previewRows: ImportPreviewRow[] = rows.map((raw, i) => {
    const latRaw = mapping.latitude ? raw[mapping.latitude] : undefined;
    const lngRaw = mapping.longitude ? raw[mapping.longitude] : undefined;
    const lat = parseCoordinateValue(latRaw);
    const lng = parseCoordinateValue(lngRaw);
    const result = validateCoordinatePair(lat, lng);

    if (result.state === 'valid') valid++;
    else if (result.state === 'invalid') invalid++;
    else missing++;

    return {
      rowIndex: i,
      raw,
      latitude: lat,
      longitude: lng,
      coordinateState: result.state,
      coordinateError: result.error,
    };
  });

  return {
    fileName,
    totalRows: rows.length,
    validCoordinates: valid,
    invalidCoordinates: invalid,
    missingCoordinates: missing,
    detectedColumns: mapping,
    allColumns: headers,
    rows: previewRows,
  };
}

function normalizeStatus(raw: unknown): TreeStatus | '' {
  if (raw === null || raw === undefined) return '';
  const s = String(raw).trim().toLowerCase();
  if (!s) return '';
  if (s.startsWith('exist')) return 'Existing';
  if (s.startsWith('new')) return 'New';
  return '';
}

/**
 * Converts previewed rows into TreeRecords. All columns not part of the
 * canonical mapping are preserved verbatim in `additionalFields`.
 */
export function rowsToTreeRecords(
  preview: ImportPreviewResult,
  existingIds: Set<string>
): TreeRecord[] {
  const { detectedColumns: mapping, allColumns } = preview;
  const mappedHeaders = new Set(
    Object.values(mapping).filter((v): v is string => Boolean(v))
  );
  const extraHeaders = allColumns.filter((h) => !mappedHeaders.has(h));

  const ids = nextTreeIdBatch(existingIds, preview.rows.length);
  const now = Date.now();

  return preview.rows.map((row, i) => {
    const additionalFields: Record<string, string | number | null> = {};
    for (const h of extraHeaders) {
      const v = row.raw[h];
      additionalFields[h] = v === '' || v === undefined ? null : (v as string | number);
    }

    const heightRaw = mapping.height ? row.raw[mapping.height] : undefined;
    const heightNum =
      heightRaw === '' || heightRaw === undefined || heightRaw === null
        ? null
        : Number(heightRaw);

    const record: TreeRecord = {
      id: ids[i],
      speciesName: mapping.speciesName ? String(row.raw[mapping.speciesName] ?? '').trim() : '',
      latitude: row.latitude,
      longitude: row.longitude,
      zoneName: mapping.zoneName ? String(row.raw[mapping.zoneName] ?? '').trim() : '',
      treeStatus: mapping.treeStatus ? normalizeStatus(row.raw[mapping.treeStatus]) : '',
      height: heightNum !== null && Number.isFinite(heightNum) ? heightNum : null,
      additionalFields,
      createdAt: now,
      updatedAt: now,
      sourceRowIndex: row.rowIndex,
    };
    return record;
  });
}
