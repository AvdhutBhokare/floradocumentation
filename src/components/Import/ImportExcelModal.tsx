import { useMemo, useState } from 'react';
import { readWorkbookRows, buildImportPreview, ExcelImportError } from '../../services/excel/importExcel';
import type { ColumnMapping, ImportPreviewResult } from '../../types/tree';
import { REQUIRED_FIELD_LABELS } from '../../types/tree';
import { useFloraStore } from '../../store/useFloraStore';

interface Props {
  onClose: () => void;
}

type Step = 'pick-file' | 'preview' | 'error';

export function ImportExcelModal({ onClose }: Props) {
  const [step, setStep] = useState<Step>('pick-file');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [errorMsg, setErrorMsg] = useState('');

  const existingCount = useFloraStore((s) => s.trees.length);
  const importFromPreview = useFloraStore((s) => s.importFromPreview);

  async function handleFile(file: File) {
    try {
      const { headers: h, rows } = await readWorkbookRows(file);
      const built = buildImportPreview(file.name, h, rows);
      setFileName(file.name);
      setHeaders(h);
      setRawRows(rows);
      setPreview(built);
      setMapping(built.detectedColumns);
      setStep('preview');
    } catch (e) {
      setErrorMsg(e instanceof ExcelImportError ? e.message : 'Unexpected error reading file.');
      setStep('error');
    }
  }

  const recomputed = useMemo(() => {
    if (!preview) return null;
    return buildImportPreview(fileName, headers, rawRows, mapping);
  }, [preview, fileName, headers, rawRows, mapping]);

  function doImport(mode: 'replace' | 'add') {
    if (!recomputed) return;
    importFromPreview(recomputed, mode);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="max-h-[85vh] w-[720px] overflow-y-auto rounded-lg border border-hairline bg-bark-850 shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-hairline bg-bark-850 px-5 py-3">
          <h2 className="font-display text-sm font-semibold tracking-wide text-paper-100">IMPORT EXCEL / CSV</h2>
          <button type="button" onClick={onClose} className="text-bark-500 hover:text-paper-100">
            ✕
          </button>
        </div>

        {step === 'pick-file' && (
          <div className="p-6">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-hairline bg-bark-900 px-6 py-14 text-center hover:border-flag">
              <span className="font-sans text-sm font-medium text-paper-100">
                Click to choose a file, or drag it here
              </span>
              <span className="mt-1 font-sans text-xs text-bark-500">.xlsx, .xls, or .csv exported from Epic Collect</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          </div>
        )}

        {step === 'error' && (
          <div className="p-6">
            <div className="rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {errorMsg}
            </div>
            <button
              type="button"
              onClick={() => setStep('pick-file')}
              className="mt-4 rounded border border-hairline px-3.5 py-1.5 font-sans text-xs font-medium text-paper-200 hover:bg-bark-800"
            >
              Try another file
            </button>
          </div>
        )}

        {step === 'preview' && recomputed && (
          <div className="space-y-5 p-5">
            <div>
              <div className="font-sans text-xs text-bark-500">File</div>
              <div className="font-mono text-sm text-paper-100">{fileName}</div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <StatBox label="Total Rows" value={recomputed.totalRows} />
              <StatBox label="Valid Coordinates" value={recomputed.validCoordinates} tone="good" />
              <StatBox label="Invalid Coordinates" value={recomputed.invalidCoordinates} tone="bad" />
              <StatBox label="Missing Coordinates" value={recomputed.missingCoordinates} tone="warn" />
            </div>

            <div>
              <div className="mb-2 font-sans text-xs font-semibold uppercase tracking-wide text-bark-500">
                Detected Columns — adjust if needed
              </div>
              <div className="space-y-2">
                {(Object.keys(REQUIRED_FIELD_LABELS) as (keyof ColumnMapping)[]).map((field) => (
                  <div key={field} className="flex items-center gap-3">
                    <span className="w-44 shrink-0 font-sans text-xs text-paper-200">
                      {REQUIRED_FIELD_LABELS[field]}
                    </span>
                    <span className="text-bark-500">→</span>
                    <select
                      value={mapping[field] ?? ''}
                      onChange={(e) =>
                        setMapping((m) => ({ ...m, [field]: e.target.value || undefined }))
                      }
                      className="flora-input"
                    >
                      <option value="">— not mapped —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {recomputed.invalidCoordinates > 0 && (
              <div className="rounded border border-danger/40 bg-danger/10 px-3 py-2 font-sans text-xs text-danger">
                {recomputed.invalidCoordinates} row(s) have coordinates outside valid range
                (latitude ±90, longitude ±180). They will still import, but won't get a map
                marker until corrected.
              </div>
            )}

            <div className="max-h-48 overflow-auto rounded border border-hairline">
              <table className="w-full text-left font-mono text-[11px]">
                <thead className="sticky top-0 bg-bark-900 text-bark-500">
                  <tr>
                    <th className="px-2 py-1">Row</th>
                    <th className="px-2 py-1">Lat</th>
                    <th className="px-2 py-1">Lng</th>
                    <th className="px-2 py-1">State</th>
                  </tr>
                </thead>
                <tbody>
                  {recomputed.rows.slice(0, 50).map((r) => (
                    <tr key={r.rowIndex} className="border-t border-hairline/60 text-paper-200">
                      <td className="px-2 py-0.5">{r.rowIndex + 1}</td>
                      <td className="px-2 py-0.5">{r.latitude ?? '—'}</td>
                      <td className="px-2 py-0.5">{r.longitude ?? '—'}</td>
                      <td
                        className={`px-2 py-0.5 ${
                          r.coordinateState === 'valid'
                            ? 'text-existing'
                            : r.coordinateState === 'invalid'
                              ? 'text-danger'
                              : 'text-flag'
                        }`}
                      >
                        {r.coordinateState}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {recomputed.rows.length > 50 && (
                <div className="border-t border-hairline bg-bark-900 px-2 py-1 text-center font-sans text-[11px] text-bark-500">
                  showing first 50 of {recomputed.rows.length} rows
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-hairline pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-hairline px-3.5 py-1.5 font-sans text-xs font-medium text-paper-200 hover:bg-bark-800"
              >
                Cancel
              </button>
              <div className="flex gap-2">
                {existingCount > 0 && (
                  <>
                    <div className="mr-2 self-center font-sans text-xs text-bark-500">
                      Current project has {existingCount} records.
                    </div>
                    <button
                      type="button"
                      onClick={() => doImport('add')}
                      className="rounded border border-hairline bg-bark-800 px-3.5 py-1.5 font-sans text-xs font-medium text-paper-100 hover:bg-bark-700"
                    >
                      Add to Current Data
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => doImport('replace')}
                  className="rounded bg-flag px-3.5 py-1.5 font-sans text-xs font-semibold text-bark-950 hover:brightness-110"
                >
                  {existingCount > 0 ? 'Replace Current Data' : 'Import'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'good' | 'bad' | 'warn';
}) {
  const color =
    tone === 'good' ? 'text-existing' : tone === 'bad' ? 'text-danger' : tone === 'warn' ? 'text-flag' : 'text-paper-100';
  return (
    <div className="rounded border border-hairline bg-bark-900 px-3 py-2">
      <div className="font-sans text-[10px] uppercase tracking-wide text-bark-500">{label}</div>
      <div className={`font-mono text-lg font-semibold ${color}`}>{value.toLocaleString()}</div>
    </div>
  );
}
