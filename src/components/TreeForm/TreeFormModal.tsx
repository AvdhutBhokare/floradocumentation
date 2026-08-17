import { useEffect, useState } from 'react';
import { useFloraStore } from '../../store/useFloraStore';
import { useZoneNameList } from '../../store/selectors';
import { detectZoneForPoint } from '../../services/gis/zoneDetection';
import { validateCoordinatePair } from '../../utils/coordinates';
import type { TreeStatus } from '../../types/tree';

interface Props {
  mode: 'add' | 'edit';
  treeId?: string;
  initialLat?: number;
  initialLng?: number;
  onClose: () => void;
}

export function TreeFormModal({ mode, treeId, initialLat, initialLng, onClose }: Props) {
  const trees = useFloraStore((s) => s.trees);
  const zones = useFloraStore((s) => s.zones);
  const addTree = useFloraStore((s) => s.addTree);
  const updateTree = useFloraStore((s) => s.updateTree);
  const zoneNames = useZoneNameList();

  const existing = mode === 'edit' ? trees.find((t) => t.id === treeId) : undefined;

  const [species, setSpecies] = useState(existing?.speciesName ?? '');
  const [lat, setLat] = useState<string>(
    existing?.latitude?.toString() ?? initialLat?.toString() ?? ''
  );
  const [lng, setLng] = useState<string>(
    existing?.longitude?.toString() ?? initialLng?.toString() ?? ''
  );
  const [zone, setZone] = useState(existing?.zoneName ?? '');
  const [status, setStatus] = useState<TreeStatus | ''>(existing?.treeStatus ?? 'New');
  const [height, setHeight] = useState<string>(existing?.height?.toString() ?? '');
  const [detectedZone, setDetectedZone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (lat && lng && Number.isFinite(latNum) && Number.isFinite(lngNum)) {
      const detected = detectZoneForPoint(latNum, lngNum, zones);
      setDetectedZone(detected);
    } else {
      setDetectedZone(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, zones]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const latNum = lat === '' ? null : Number(lat);
    const lngNum = lng === '' ? null : Number(lng);

    if (lat !== '' && !Number.isFinite(latNum)) {
      setError('Latitude must be a number.');
      return;
    }
    if (lng !== '' && !Number.isFinite(lngNum)) {
      setError('Longitude must be a number.');
      return;
    }
    const check = validateCoordinatePair(latNum, lngNum);
    if (check.state === 'invalid') {
      setError(check.error ?? 'Invalid coordinates.');
      return;
    }

    const heightNum = height === '' ? null : Number(height);
    if (height !== '' && !Number.isFinite(heightNum)) {
      setError('Height must be a number.');
      return;
    }

    if (mode === 'add') {
      addTree({
        speciesName: species.trim(),
        latitude: latNum,
        longitude: lngNum,
        zoneName: zone.trim(),
        treeStatus: status,
        height: heightNum,
        isUnsaved: false,
      });
    } else if (existing) {
      updateTree(existing.id, {
        speciesName: species.trim(),
        latitude: latNum,
        longitude: lngNum,
        zoneName: zone.trim(),
        treeStatus: status,
        height: heightNum,
      });
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[420px] rounded-lg border border-hairline bg-bark-850 shadow-2xl">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <h2 className="font-display text-sm font-semibold tracking-wide text-paper-100">
            {mode === 'add' ? 'ADD TREE' : `EDIT ${existing?.id}`}
          </h2>
          <button type="button" onClick={onClose} className="text-bark-500 hover:text-paper-100">
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4">
          {error && (
            <div className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          <Field label="Species Name">
            <input
              autoFocus
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              placeholder="e.g. Azadirachta indica"
              className="flora-input"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude">
              <input value={lat} onChange={(e) => setLat(e.target.value)} className="flora-input font-mono" />
            </Field>
            <Field label="Longitude">
              <input value={lng} onChange={(e) => setLng(e.target.value)} className="flora-input font-mono" />
            </Field>
          </div>

          <Field label="Zone">
            <input
              list="zone-suggestions"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder={detectedZone ? `Detected: ${detectedZone}` : 'Zone name'}
              className="flora-input"
            />
            <datalist id="zone-suggestions">
              {zoneNames.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
            {detectedZone && detectedZone !== zone && (
              <button
                type="button"
                onClick={() => setZone(detectedZone)}
                className="mt-1 text-[11px] font-medium text-flag hover:underline"
              >
                Use detected zone “{detectedZone}”
              </button>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TreeStatus | '')}
                className="flora-input"
              >
                <option value="">—</option>
                <option value="Existing">Existing</option>
                <option value="New">New</option>
              </select>
            </Field>
            <Field label="Height (m)">
              <input value={height} onChange={(e) => setHeight(e.target.value)} className="flora-input" />
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-hairline px-3.5 py-1.5 font-sans text-xs font-medium text-paper-200 hover:bg-bark-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded bg-flag px-3.5 py-1.5 font-sans text-xs font-semibold text-bark-950 hover:brightness-110"
            >
              {mode === 'add' ? 'Add Tree' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-sans text-[11px] font-medium uppercase tracking-wide text-bark-500">
        {label}
      </span>
      {children}
    </label>
  );
}
