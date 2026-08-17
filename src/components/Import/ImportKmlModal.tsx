import { useMemo, useState } from 'react';
import { parseKmlFile, KmlImportError } from '../../services/kml/importKml';
import type { ZoneFeature } from '../../types/tree';
import { useFloraStore } from '../../store/useFloraStore';

interface Props {
  onClose: () => void;
}

function geometryLabel(geometry: GeoJSON.Geometry): string {
  switch (geometry.type) {
    case 'Polygon':
    case 'MultiPolygon':
      return 'area';
    case 'LineString':
    case 'MultiLineString':
      return 'line';
    case 'Point':
      return 'point';
    default:
      return geometry.type.toLowerCase();
  }
}

export function ImportKmlModal({ onClose }: Props) {
  const [zones, setZones] = useState<ZoneFeature[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');

  const existingZoneCount = useFloraStore((s) => s.zones.length);
  const importZones = useFloraStore((s) => s.importZones);

  async function handleFile(file: File) {
    try {
      const parsed = await parseKmlFile(file);
      setZones(parsed);
      setSelectedIds(new Set(parsed.map((z) => z.id))); // everything selected by default
      setFileName(file.name);
      setError('');
    } catch (e) {
      setError(e instanceof KmlImportError ? e.message : 'Unexpected error reading KML file.');
      setZones(null);
    }
  }

  const selectedZones = useMemo(
    () => (zones ?? []).filter((z) => selectedIds.has(z.id)),
    [zones, selectedIds]
  );

  function toggleZone(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (!zones) return;
    setSelectedIds(new Set(zones.map((z) => z.id)));
  }

  function selectNone() {
    setSelectedIds(new Set());
  }

  function doImport(mode: 'replace' | 'add') {
    if (selectedZones.length === 0) return;
    importZones(selectedZones, mode);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[560px] rounded-lg border border-hairline bg-bark-850 shadow-2xl">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <h2 className="font-display text-sm font-semibold tracking-wide text-paper-100">IMPORT KML BOUNDARIES</h2>
          <button type="button" onClick={onClose} className="text-bark-500 hover:text-paper-100">
            ✕
          </button>
        </div>

        <div className="p-6">
          {!zones && !error && (
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-hairline bg-bark-900 px-6 py-14 text-center hover:border-flag">
              <span className="font-sans text-sm font-medium text-paper-100">Click to choose a .kml file</span>
              <span className="mt-1 font-sans text-xs text-bark-500">Zone/site boundary polygons</span>
              <input
                type="file"
                accept=".kml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          )}

          {error && (
            <div>
              <div className="rounded border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
              <button
                type="button"
                onClick={() => setError('')}
                className="mt-4 rounded border border-hairline px-3.5 py-1.5 font-sans text-xs font-medium text-paper-200 hover:bg-bark-800"
              >
                Try another file
              </button>
            </div>
          )}

          {zones && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-sans text-xs text-bark-500">File</div>
                  <div className="font-mono text-sm text-paper-100">{fileName}</div>
                </div>
                <div className="rounded border border-hairline bg-bark-900 px-3 py-2 font-sans text-xs text-paper-100">
                  {selectedZones.length} of {zones.length} selected
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-sans text-xs text-bark-500">
                  Choose which boundaries to bring into the project — everything's selected by default.
                </span>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="font-sans text-xs font-medium text-flag hover:underline"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={selectNone}
                    className="font-sans text-xs font-medium text-bark-500 hover:text-paper-200 hover:underline"
                  >
                    Select none
                  </button>
                </div>
              </div>

              <ul className="max-h-64 space-y-0.5 overflow-y-auto rounded border border-hairline bg-bark-900 p-1.5">
                {zones.map((z) => {
                  const checked = selectedIds.has(z.id);
                  return (
                    <li key={z.id}>
                      <label
                        className={`flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 font-sans text-xs hover:bg-bark-800 ${
                          checked ? 'text-paper-100' : 'text-bark-500'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleZone(z.id)}
                          className="accent-flag"
                        />
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: z.color, opacity: checked ? 1 : 0.35 }}
                        />
                        <span className="flex-1 truncate">{z.name}</span>
                        <span className="text-bark-500">{geometryLabel(z.geometry)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              <div className="flex items-center justify-between border-t border-hairline pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded border border-hairline px-3.5 py-1.5 font-sans text-xs font-medium text-paper-200 hover:bg-bark-800"
                >
                  Cancel
                </button>
                <div className="flex gap-2">
                  {existingZoneCount > 0 && (
                    <button
                      type="button"
                      disabled={selectedZones.length === 0}
                      onClick={() => doImport('add')}
                      className="rounded border border-hairline bg-bark-800 px-3.5 py-1.5 font-sans text-xs font-medium text-paper-100 hover:bg-bark-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Add {selectedZones.length || ''} to Existing Zones
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={selectedZones.length === 0}
                    onClick={() => doImport('replace')}
                    className="rounded bg-flag px-3.5 py-1.5 font-sans text-xs font-semibold text-bark-950 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {existingZoneCount > 0 ? `Replace Zones with ${selectedZones.length} Selected` : `Import ${selectedZones.length} Selected`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
