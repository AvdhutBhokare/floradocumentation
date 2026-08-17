import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { useFloraStore } from '../../store/useFloraStore';
import { boundsForSingleZone } from '../../services/gis/zoneDetection';
import { MAP_MAX_ZOOM } from '../../config/baseMapTiles';

/**
 * Bridges store "focus" signals (Section 22/23/25) to real Leaflet map
 * movement: clicking a spreadsheet row or search result flies to + opens
 * that tree's popup; selecting a zone fits the map to its polygon.
 */
export function MapFocusController() {
  const map = useMap();
  const trees = useFloraStore((s) => s.trees);
  const zones = useFloraStore((s) => s.zones);
  const selectedTreeId = useFloraStore((s) => s.selectedTreeId);
  const mapFocusNonce = useFloraStore((s) => s.mapFocusNonce);
  const selectedZoneName = useFloraStore((s) => s.selectedZoneName);
  const zoneFocusNonce = useFloraStore((s) => s.zoneFocusNonce);

  useEffect(() => {
    if (!selectedTreeId) return;
    const tree = trees.find((t) => t.id === selectedTreeId);
    if (!tree || tree.latitude === null || tree.longitude === null) return;
    map.flyTo([tree.latitude, tree.longitude], Math.min(Math.max(map.getZoom(), 20), MAP_MAX_ZOOM), {
      duration: 0.6,
    });
    const timeout = setTimeout(() => {
      map.eachLayer((layer) => {
        // Marker popups are opened by TreeMarkerLayer directly via its own marker refs;
        // here we just ensure the view centers. Popup opening is handled by re-querying
        // the cluster group's registered markers through a custom event.
        void layer;
      });
      window.dispatchEvent(new CustomEvent('flora:open-popup', { detail: { id: selectedTreeId } }));
    }, 650);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapFocusNonce]);

  useEffect(() => {
    if (!selectedZoneName) return;
    const zone = zones.find((z) => z.name === selectedZoneName);
    if (!zone) return;
    const bounds = boundsForSingleZone(zone);
    if (bounds) {
      map.flyToBounds(bounds, { padding: [40, 40], duration: 0.6 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneFocusNonce]);

  return null;
}
