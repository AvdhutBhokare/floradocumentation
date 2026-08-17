import { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, ScaleControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { TreeRecord } from '../../types/tree';
import { useFloraStore } from '../../store/useFloraStore';
import { TreeMarkerLayer } from './TreeMarkerLayer';
import { ZonePolygonLayer } from './ZonePolygonLayer';
import { MapInteractionLayer } from './MapInteractionLayer';
import { MapFocusController } from './MapFocusController';
import { legendColor } from './markerIcons';
import { MAP_MAX_ZOOM, SATELLITE_TILE, STREET_TILE } from '../../config/baseMapTiles';

const DEFAULT_CENTER: [number, number] = [18.5204, 73.8567]; // Pune, India — sensible default for this project

interface Props {
  trees: TreeRecord[];
}

type BaseMap = 'street' | 'satellite';

interface LayerVisibility {
  zones: boolean;
  markers: boolean;
  existing: boolean;
  newTrees: boolean;
}

export function MapView({ trees }: Props) {
  const zones = useFloraStore((s) => s.zones);
  const addTreeArmed = useFloraStore((s) => s.addTreeArmed);
  const setAddTreeArmed = useFloraStore((s) => s.setAddTreeArmed);
  const selectedZoneName = useFloraStore((s) => s.selectedZoneName);
  const repositioningTreeId = useFloraStore((s) => s.repositioningTreeId);
  const cancelRepositionTree = useFloraStore((s) => s.cancelRepositionTree);

  const [baseMap, setBaseMap] = useState<BaseMap>('street');
  const [layers, setLayers] = useState<LayerVisibility>({
    zones: true,
    markers: true,
    existing: true,
    newTrees: true,
  });
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [cursor, setCursor] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const visibleTrees = trees.filter((t) => {
    if (!layers.markers) return false;
    if (t.treeStatus === 'Existing' && !layers.existing) return false;
    if (t.treeStatus === 'New' && !layers.newTrees) return false;
    if (t.treeStatus === '' && !(layers.existing && layers.newTrees)) return false;
    return true;
  });

  return (
    <div className="relative h-full w-full bg-bark-900">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={16}
        maxZoom={MAP_MAX_ZOOM}
        className="h-full w-full"
        zoomControl={false}
        preferCanvas
        ref={mapRef}
      >
        {baseMap === 'street' ? (
          <TileLayer
            key="street"
            attribution={STREET_TILE.attribution}
            url={STREET_TILE.url}
            maxZoom={MAP_MAX_ZOOM}
            maxNativeZoom={STREET_TILE.maxNativeZoom}
          />
        ) : (
          <TileLayer
            key="satellite"
            attribution={SATELLITE_TILE.attribution}
            url={SATELLITE_TILE.url}
            maxZoom={MAP_MAX_ZOOM}
            maxNativeZoom={SATELLITE_TILE.maxNativeZoom}
          />
        )}

        <ZonePolygonLayer zones={zones} visible={layers.zones} />
        <TreeMarkerLayer trees={visibleTrees} />
        <MapInteractionLayer onCursorMove={(lat, lng) => setCursor({ lat, lng })} />
        <MapFocusController />
        <ScaleControl position="bottomleft" />
        <ZoomControlTopRight />
        <FitAllButton trees={trees} zones={zones} />
      </MapContainer>

      {/* Top-left: Add Tree control */}
      <div className="pointer-events-none absolute left-3 top-3 z-[1000] flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setAddTreeArmed(!addTreeArmed)}
          className={`pointer-events-auto flex items-center gap-2 rounded-md border px-3 py-2 font-sans text-sm font-medium shadow-lg transition-colors ${
            addTreeArmed
              ? 'border-flag bg-flag text-bark-950'
              : 'border-hairline bg-bark-850/95 text-paper-100 hover:bg-bark-800'
          }`}
        >
          <span className="text-base leading-none">{addTreeArmed ? '×' : '+'}</span>
          {addTreeArmed ? 'Click map to place tree' : 'Add Tree'}
        </button>
        {selectedZoneName && (
          <div className="pointer-events-auto rounded-md border border-hairline bg-bark-850/95 px-3 py-1.5 font-sans text-xs text-paper-200 shadow-lg">
            Zone focus: <span className="font-semibold text-selected">{selectedZoneName}</span>
          </div>
        )}
        {repositioningTreeId && (
          <div className="pointer-events-auto flex items-center gap-3 rounded-md border border-flag/50 bg-bark-850/95 px-3 py-2 font-sans text-xs text-paper-100 shadow-lg">
            <span>Drag the pin to its new location, then release.</span>
            <button
              type="button"
              onClick={cancelRepositionTree}
              className="rounded border border-hairline px-2 py-1 font-medium text-paper-200 hover:bg-bark-800"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Top-right: base map + layers */}
      <div className="pointer-events-none absolute right-3 top-3 z-[1000] flex flex-col items-end gap-2">
        <div className="pointer-events-auto flex overflow-hidden rounded-md border border-hairline shadow-lg">
          <button
            type="button"
            onClick={() => setBaseMap('street')}
            className={`px-3 py-1.5 font-sans text-xs font-medium ${
              baseMap === 'street' ? 'bg-flag text-bark-950' : 'bg-bark-850/95 text-paper-200 hover:bg-bark-800'
            }`}
          >
            Street
          </button>
          <button
            type="button"
            onClick={() => setBaseMap('satellite')}
            className={`px-3 py-1.5 font-sans text-xs font-medium ${
              baseMap === 'satellite' ? 'bg-flag text-bark-950' : 'bg-bark-850/95 text-paper-200 hover:bg-bark-800'
            }`}
          >
            Satellite
          </button>
        </div>

        <div className="pointer-events-auto relative">
          <button
            type="button"
            onClick={() => setLayerMenuOpen((v) => !v)}
            className="rounded-md border border-hairline bg-bark-850/95 px-3 py-1.5 font-sans text-xs font-medium text-paper-200 shadow-lg hover:bg-bark-800"
          >
            Layers ▾
          </button>
          {layerMenuOpen && (
            <div className="absolute right-0 mt-1 w-52 rounded-md border border-hairline bg-bark-850 p-2 shadow-xl">
              <LayerToggle
                label="Zone Boundaries"
                checked={layers.zones}
                onChange={(v) => setLayers((l) => ({ ...l, zones: v }))}
              />
              <LayerToggle
                label="Tree Markers"
                checked={layers.markers}
                onChange={(v) => setLayers((l) => ({ ...l, markers: v }))}
              />
              <LayerToggle
                label="Existing Trees"
                swatch={legendColor('existing')}
                checked={layers.existing}
                onChange={(v) => setLayers((l) => ({ ...l, existing: v }))}
              />
              <LayerToggle
                label="New Trees"
                swatch={legendColor('new')}
                checked={layers.newTrees}
                onChange={(v) => setLayers((l) => ({ ...l, newTrees: v }))}
              />
            </div>
          )}
        </div>
      </div>

      {/* Bottom-right: live coordinate readout */}
      <div className="pointer-events-none absolute bottom-6 right-3 z-[1000] rounded-md border border-hairline bg-bark-850/95 px-3 py-1.5 font-mono text-xs text-paper-200 shadow-lg">
        {cursor ? `${cursor.lat.toFixed(6)}, ${cursor.lng.toFixed(6)}` : '—.——————, —.——————'}
      </div>
    </div>
  );
}

function LayerToggle({
  label,
  checked,
  onChange,
  swatch,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  swatch?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 font-sans text-xs text-paper-200 hover:bg-bark-800">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-flag" />
      {swatch && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: swatch }} />}
      {label}
    </label>
  );
}

function ZoomControlTopRight() {
  const map = useMap();
  useEffect(() => {
    const control = L.control.zoom({ position: 'bottomright' });
    control.addTo(map);
    return () => {
      control.remove();
    };
  }, [map]);
  return null;
}

function FitAllButton({ trees, zones }: { trees: TreeRecord[]; zones: ReturnType<typeof useFloraStore.getState>['zones'] }) {
  const map = useMap();

  const fitTrees = useCallback(() => {
    const pts = trees.filter((t) => t.latitude !== null && t.longitude !== null);
    if (pts.length === 0) return;
    const bounds = L.latLngBounds(pts.map((t) => [t.latitude as number, t.longitude as number]));
    map.flyToBounds(bounds, { padding: [40, 40], duration: 0.6 });
  }, [trees, map]);

  const fitZones = useCallback(() => {
    if (zones.length === 0) return;
    const layer = L.geoJSON(
      zones.map((z) => ({ type: 'Feature', geometry: z.geometry, properties: {} })) as GeoJSON.Feature[]
    );
    const bounds = layer.getBounds();
    if (bounds.isValid()) map.flyToBounds(bounds, { padding: [40, 40], duration: 0.6 });
  }, [zones, map]);

  useEffect(() => {
    // Auto-fit once when data first arrives (Section 6: "fit map to imported data").
  }, []);

  return (
    <div className="leaflet-bottom leaflet-left" style={{ marginBottom: 44 }}>
      <div className="leaflet-control leaflet-bar flex flex-col overflow-hidden !border-hairline bg-bark-850/95 font-sans text-xs text-paper-200 shadow-lg">
        <button type="button" onClick={fitTrees} className="border-b border-hairline px-2.5 py-1.5 hover:bg-bark-800" title="Fit all trees">
          Fit trees
        </button>
        <button type="button" onClick={fitZones} className="px-2.5 py-1.5 hover:bg-bark-800" title="Fit all zones">
          Fit zones
        </button>
      </div>
    </div>
  );
}
