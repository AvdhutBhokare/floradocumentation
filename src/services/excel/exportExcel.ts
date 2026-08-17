import * as XLSX from 'xlsx';
import type { TreeRecord } from '../../types/tree';
import { REQUIRED_FIELD_LABELS } from '../../types/tree';

/**
 * Flattens TreeRecords back into plain row objects, restoring the
 * additionalFields columns alongside the canonical fields so nothing
 * collected by Epic Collect (or added in-app) is lost on export.
 */
export function treesToRows(trees: TreeRecord[]): Record<string, unknown>[] {
  // Union of all additionalFields keys across all records, in first-seen order,
  // so every row gets a consistent column set even if some records came from
  // different source imports.
  const extraKeys: string[] = [];
  const seen = new Set<string>();
  for (const t of trees) {
    for (const k of Object.keys(t.additionalFields)) {
      if (!seen.has(k)) {
        seen.add(k);
        extraKeys.push(k);
      }
    }
  }

  return trees.map((t) => {
    const row: Record<string, unknown> = {
      'Tree ID': t.id,
      [REQUIRED_FIELD_LABELS.speciesName]: t.speciesName,
      [REQUIRED_FIELD_LABELS.latitude]: t.latitude ?? '',
      [REQUIRED_FIELD_LABELS.longitude]: t.longitude ?? '',
      [REQUIRED_FIELD_LABELS.zoneName]: t.zoneName,
      [REQUIRED_FIELD_LABELS.treeStatus]: t.treeStatus,
      [REQUIRED_FIELD_LABELS.height]: t.height ?? '',
    };
    for (const k of extraKeys) {
      row[k] = t.additionalFields[k] ?? '';
    }
    return row;
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportToExcel(trees: TreeRecord[], projectName: string) {
  const rows = treesToRows(trees);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Trees');
  const safeName = projectName.replace(/[^a-z0-9_\- ]/gi, '').trim() || 'flora-survey';
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  downloadBlob(
    new Blob([wbout], { type: 'application/octet-stream' }),
    `${safeName}.xlsx`
  );
}

export function exportToCsv(trees: TreeRecord[], projectName: string) {
  const rows = treesToRows(trees);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const safeName = projectName.replace(/[^a-z0-9_\- ]/gi, '').trim() || 'flora-survey';
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${safeName}.csv`);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Exports current tree records (not the original zone boundary KML) as a point KML. */
export function exportTreesToKml(trees: TreeRecord[], projectName: string) {
  const placemarks = trees
    .filter((t) => t.latitude !== null && t.longitude !== null)
    .map((t) => {
      const name = escapeXml(t.id);
      const desc = escapeXml(
        [
          `Species: ${t.speciesName || '—'}`,
          `Zone: ${t.zoneName || '—'}`,
          `Status: ${t.treeStatus || '—'}`,
          `Height: ${t.height ?? '—'}`,
        ].join('\n')
      );
      return `  <Placemark>
    <name>${name}</name>
    <description>${desc}</description>
    <ExtendedData>
      <Data name="species"><value>${escapeXml(t.speciesName)}</value></Data>
      <Data name="zone"><value>${escapeXml(t.zoneName)}</value></Data>
      <Data name="status"><value>${escapeXml(t.treeStatus)}</value></Data>
      <Data name="height"><value>${t.height ?? ''}</value></Data>
    </ExtendedData>
    <Point>
      <coordinates>${t.longitude},${t.latitude},0</coordinates>
    </Point>
  </Placemark>`;
    })
    .join('\n');

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${escapeXml(projectName)} - Trees</name>
${placemarks}
</Document>
</kml>`;

  const safeName = projectName.replace(/[^a-z0-9_\- ]/gi, '').trim() || 'flora-survey';
  downloadBlob(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }), `${safeName}-trees.kml`);
}
