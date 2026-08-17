import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import type { TreeRecord } from '../../types/tree';
import { getTreeIcon, markerVisualState } from './markerIcons';
import { useFloraStore } from '../../store/useFloraStore';
import { showToast } from '../Common/Toast';
import { MAP_MAX_ZOOM } from '../../config/baseMapTiles';

interface Props {
  trees: TreeRecord[];
}

/**
 * Renders tree markers imperatively via leaflet.markercluster instead of one
 * <Marker> per tree. This is what keeps the map responsive at 10,000+
 * records (Section 47): only markers that actually changed are
 * added/removed/re-iconed on each update, and adds/removes are batched
 * through the cluster group's bulk `addLayers`/`removeLayers` APIs instead
 * of one `addLayer`/`removeLayer` call per marker — with thousands of
 * markers, one-at-a-time calls each recompute the cluster spatial index and
 * visibly stall the map; the bulk methods recompute it once per batch.
 *
 * Repositioning: click "Reposition" in a marker popup (or the map banner).
 * That lifts the pin out of the cluster group onto the map layer — the only
 * reliable way to make Leaflet dragging work — zooms in, and arms drag until
 * the pin is dropped or Cancel / Escape is pressed.
 */
export function TreeMarkerLayer({ trees }: Props) {
  const map = useMap();
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersById = useRef<Map<string, L.Marker>>(new Map());
  const repositionMarkerRef = useRef<L.Marker | null>(null);
  const isDraggingRef = useRef(false);

  const selectedTreeId = useFloraStore((s) => s.selectedTreeId);
  const repositioningTreeId = useFloraStore((s) => s.repositioningTreeId);
  const selectTree = useFloraStore((s) => s.selectTree);
  const startRepositionTree = useFloraStore((s) => s.startRepositionTree);
  const cancelRepositionTree = useFloraStore((s) => s.cancelRepositionTree);
  const updateTreeCoordinates = useFloraStore((s) => s.updateTreeCoordinates);
  const deleteTreeAction = useFloraStore((s) => s.deleteTree);

  const finishReposition = (marker: L.Marker) => {
    marker.dragging?.disable();
    marker.getElement()?.classList.remove('flora-marker-repositioning');

    const group = clusterGroupRef.current;
    if (group && map.hasLayer(marker)) {
      map.removeLayer(marker);
      if (!group.hasLayer(marker)) group.addLayer(marker);
    }
    if (repositionMarkerRef.current === marker) repositionMarkerRef.current = null;
  };

  const beginReposition = (id: string, marker: L.Marker) => {
    const tree = trees.find((t) => t.id === id);
    if (!tree || tree.latitude === null || tree.longitude === null) return;

    // Tear down any in-progress reposition first.
    if (repositionMarkerRef.current && repositionMarkerRef.current !== marker) {
      finishReposition(repositionMarkerRef.current);
    }

    const group = clusterGroupRef.current;
    if (group?.hasLayer(marker)) {
      group.removeLayer(marker);
      map.addLayer(marker);
    } else if (!map.hasLayer(marker)) {
      map.addLayer(marker);
    }

    marker.closePopup();
    marker.dragging?.enable();
    marker.getElement()?.classList.add('flora-marker-repositioning');
    repositionMarkerRef.current = marker;

    map.flyTo([tree.latitude, tree.longitude], Math.min(Math.max(map.getZoom(), 20), MAP_MAX_ZOOM), {
      duration: 0.45,
    });
  };

  // Sync reposition mode from the store (popup button / external callers).
  useEffect(() => {
    if (!repositioningTreeId) {
      if (repositionMarkerRef.current) finishReposition(repositionMarkerRef.current);
      return;
    }
    const marker = markersById.current.get(repositioningTreeId);
    if (marker) beginReposition(repositioningTreeId, marker);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositioningTreeId]);

  useEffect(() => {
    const group = L.markerClusterGroup({
      chunkedLoading: true,
      chunkInterval: 50,
      chunkDelay: 10,
      removeOutsideVisibleBounds: true,
      maxClusterRadius: 60,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 19,
    });
    clusterGroupRef.current = group;
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
      clusterGroupRef.current = null;
      markersById.current.clear();
      repositionMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && useFloraStore.getState().repositioningTreeId) {
        cancelRepositionTree();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancelRepositionTree]);

  useEffect(() => {
    const group = clusterGroupRef.current;
    if (!group) return;
    const byId = markersById.current;
    const seen = new Set<string>();
    const toAdd: L.Marker[] = [];
    const toRemove: L.Marker[] = [];

    for (const tree of trees) {
      seen.add(tree.id);
      const hasCoords = tree.latitude !== null && tree.longitude !== null;
      const existingMarker = byId.get(tree.id);

      if (!hasCoords) {
        if (existingMarker) {
          toRemove.push(existingMarker);
          byId.delete(tree.id);
        }
        continue;
      }

      const latlng = L.latLng(tree.latitude as number, tree.longitude as number);
      const state = markerVisualState(tree, tree.id === selectedTreeId);
      const icon = getTreeIcon(state);

      if (existingMarker) {
        const isRepositioning = repositioningTreeId === tree.id;
        const cur = existingMarker.getLatLng();
        if (!isDraggingRef.current && (cur.lat !== latlng.lat || cur.lng !== latlng.lng)) {
          existingMarker.setLatLng(latlng);
        }
        existingMarker.setIcon(icon);
        existingMarker.setPopupContent(buildPopupContent(tree));
        if (
          !isRepositioning &&
          repositionMarkerRef.current !== existingMarker &&
          !group.hasLayer(existingMarker) &&
          !map.hasLayer(existingMarker)
        ) {
          group.addLayer(existingMarker);
        }
      } else {
        const marker = L.marker(latlng, { icon, draggable: false, riseOnHover: true });
        marker.bindPopup(buildPopupContent(tree), { minWidth: 220 });

        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          selectTree(tree.id, 'map');
        });

        marker.on('dragstart', () => {
          isDraggingRef.current = true;
        });

        marker.on('dragend', () => {
          isDraggingRef.current = false;
          if (useFloraStore.getState().repositioningTreeId !== tree.id) return;
          const pos = marker.getLatLng();
          updateTreeCoordinates(tree.id, pos.lat, pos.lng);
          showToast(`${tree.id} location updated`);
          cancelRepositionTree();
          finishReposition(marker);
        });

        marker.on('popupopen', () => {
          const el = marker.getPopup()?.getElement();
          if (!el || el.dataset.floraBound === 'true') return;
          el.dataset.floraBound = 'true';
          el.addEventListener('click', (evt) => {
            const target = evt.target as HTMLElement;
            if (target.closest('[data-action="reposition"]')) {
              startRepositionTree(tree.id);
            } else if (target.closest('[data-action="edit"]')) {
              selectTree(tree.id, 'map');
              window.dispatchEvent(new CustomEvent('flora:edit-tree', { detail: { id: tree.id } }));
            } else if (target.closest('[data-action="delete"]')) {
              window.dispatchEvent(new CustomEvent('flora:delete-tree', { detail: { id: tree.id } }));
            }
          });
        });

        toAdd.push(marker);
        byId.set(tree.id, marker);
      }
    }

    for (const [id, marker] of byId.entries()) {
      if (!seen.has(id)) {
        toRemove.push(marker);
        byId.delete(id);
      }
    }

    if (toRemove.length > 0) {
      for (const marker of toRemove) {
        if (marker.isPopupOpen()) marker.closePopup();
        if (repositionMarkerRef.current === marker) repositionMarkerRef.current = null;
      }
      group.removeLayers(toRemove);
      for (const marker of toRemove) {
        if (map.hasLayer(marker)) map.removeLayer(marker);
      }
    }
    if (toAdd.length > 0) {
      group.addLayers(toAdd);
    }

    if (repositioningTreeId) {
      const marker = byId.get(repositioningTreeId);
      if (marker && repositionMarkerRef.current !== marker) {
        beginReposition(repositioningTreeId, marker);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trees, selectedTreeId, repositioningTreeId]);

  useEffect(() => {
    function handleDelete(e: Event) {
      const id = (e as CustomEvent).detail?.id as string;
      if (!id) return;
      markersById.current.get(id)?.closePopup();
      if (useFloraStore.getState().repositioningTreeId === id) cancelRepositionTree();
      if (window.confirm(`Delete ${id}?\n\nThis will remove the tree from the current dataset.`)) {
        deleteTreeAction(id);
      }
    }
    window.addEventListener('flora:delete-tree', handleDelete);
    return () => window.removeEventListener('flora:delete-tree', handleDelete);
  }, [cancelRepositionTree, deleteTreeAction]);

  useEffect(() => {
    function handleOpenPopup(e: Event) {
      const id = (e as CustomEvent).detail?.id as string;
      markersById.current.get(id)?.openPopup();
    }
    window.addEventListener('flora:open-popup', handleOpenPopup);
    return () => window.removeEventListener('flora:open-popup', handleOpenPopup);
  }, []);

  return null;
}

function esc(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function buildPopupContent(tree: TreeRecord): string {
  return `
    <div class="flora-popup">
      <div class="flora-popup-id">${esc(tree.id)}</div>
      <div class="flora-popup-row"><span>Species</span><strong>${esc(tree.speciesName || '—')}</strong></div>
      <div class="flora-popup-row"><span>Zone</span><strong>${esc(tree.zoneName || '—')}</strong></div>
      <div class="flora-popup-row"><span>Status</span><strong>${esc(tree.treeStatus || '—')}</strong></div>
      <div class="flora-popup-row"><span>Height</span><strong>${tree.height ?? '—'} m</strong></div>
      <div class="flora-popup-row"><span>Latitude</span><strong>${tree.latitude?.toFixed(6)}</strong></div>
      <div class="flora-popup-row"><span>Longitude</span><strong>${tree.longitude?.toFixed(6)}</strong></div>
      <div class="flora-popup-actions">
        <button data-action="reposition" type="button">Reposition</button>
        <button data-action="edit" type="button">Edit</button>
        <button data-action="delete" type="button" class="danger">Delete</button>
      </div>
    </div>
  `;
}
