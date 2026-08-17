/**
 * Core domain types for the Flora Documentation GIS Manager.
 *
 * TreeRecord is the single source of truth. Both the spreadsheet and the
 * map render views derived from the same array of TreeRecords held in the
 * Zustand store — neither the grid nor the map keeps its own copy of the
 * data.
 */

export type TreeStatus = 'Existing' | 'New';

/**
 * The canonical, strongly-typed fields every TreeRecord has.
 * Anything from the source spreadsheet that isn't one of these primary
 * fields is preserved verbatim inside `additionalFields`, and re-emitted
 * on export so no column is ever lost.
 */
export interface TreeRecord {
  /** Stable internal identity, e.g. "TREE-0001". Never derived from row position. */
  id: string;

  speciesName: string;
  latitude: number | null;
  longitude: number | null;
  zoneName: string;
  treeStatus: TreeStatus | '';
  height: number | null;

  /** true for markers placed in-app that have not yet been reviewed/confirmed */
  isUnsaved?: boolean;

  /** Every other column from the imported file, keyed by its original header. */
  additionalFields: Record<string, string | number | null>;

  /** Bookkeeping */
  createdAt: number;
  updatedAt: number;
  sourceRowIndex?: number;
}

export interface ZoneFeature {
  id: string;
  name: string;
  /** GeoJSON geometry, already normalized to [lng, lat] winding per GeoJSON spec */
  geometry: GeoJSON.Geometry;
  color: string;
  sourceFile: string;
}

export type ZoneReviewStatus = 'Not Reviewed' | 'Needs Data' | 'Reviewed' | 'Completed';

export interface ZoneReviewState {
  zoneName: string;
  status: ZoneReviewStatus;
  note?: string;
  updatedAt: number;
}

export interface ColumnMapping {
  speciesName?: string;
  latitude?: string;
  longitude?: string;
  zoneName?: string;
  treeStatus?: string;
  height?: string;
}

export interface ImportPreviewRow {
  rowIndex: number;
  raw: Record<string, unknown>;
  latitude: number | null;
  longitude: number | null;
  coordinateState: 'valid' | 'invalid' | 'missing';
  coordinateError?: string;
}

export interface ImportPreviewResult {
  fileName: string;
  totalRows: number;
  validCoordinates: number;
  invalidCoordinates: number;
  missingCoordinates: number;
  detectedColumns: ColumnMapping;
  allColumns: string[];
  rows: ImportPreviewRow[];
}

export interface ProjectMeta {
  name: string;
  createdAt: number;
  updatedAt: number;
}

export const REQUIRED_FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  speciesName: 'Tree Species Name',
  latitude: 'Latitude',
  longitude: 'Longitude',
  zoneName: 'Zone Name',
  treeStatus: 'Existing Tree / New Tree',
  height: 'Height',
};
