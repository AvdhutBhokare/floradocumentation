import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import type { TreeRecord } from '../../types/tree';
import { getTreeIcon, markerVisualState } from './markerIcons';
import { useFloraStore } from '../../store/useFloraStore';
import { showToast } from '../Common/Toast';

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
 * IMPORTANT (fixes "deleting one tree removes every marker"): removing a
 * marker from a MarkerClusterGroup while that marker's popup is open can
 * corrupt the cluster's internal spatial index in older/edge-case
 * leaflet.markercluster paths, which visually empties the whole layer. We
 * always close a marker's popup before removing it to avoid that.
 */
export function TreeMarkerLayer({ trees }: Props) {
  const map = useMap();
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersById = useRef<Map<string, L.Marker>>(new Map());
  // The one marker currently "unlocked" for dragging (double-clicked, not
  // yet dropped or cancelled). Only one at a time, on purpose — see
  // lockUnlockedMarker/unlockMarkerForDrag below.
  const unlockedRef = useRef<{ id: string; marker: L.Marker } | null>(null);
  // MarkerClusterGroup intercepts pointer events — a marker must be lifted
  // onto the map layer directly before Leaflet dragging can work.
  const liftedForDragRef = useRef<{ marker: L.Marker; fromCluster: boolean } | null>(null);

  const selectedTreeId = useFloraStore((s) => s.selectedTreeId);
  const selectTree = useFloraStore((s) => s.selectTree);
  const updateTreeCoordinates = useFloraStore((s) => s.updateTreeCoordinates);
  const deleteTreeAction = useFloraStore((s) => s.deleteTree);

  const reattachMarkerToCluster = (marker: L.Marker) => {
    const lifted = liftedForDragRef.current;
    if (!lifted || lifted.marker !== marker) return;
    liftedForDragRef.current = null;

    const group = clusterGroupRef.current;
    if (!lifted.fromCluster || !group) return;

    if (map.hasLayer(marker)) map.removeLayer(marker);
    if (!group.hasLayer(marker)) group.addLayer(marker);
  };

  const liftMarkerForDrag = (marker: L.Marker) => {
    const group = clusterGroupRef.current;
    if (!group) return;

    if (group.hasLayer(marker)) {
      group.removeLayer(marker);
      map.addLayer(marker);
      liftedForDragRef.current = { marker, fromCluster: true };
    } else if (map.hasLayer(marker)) {
      liftedForDragRef.current = { marker, fromCluster: false };
    }
  };

  // Re-locks whatever marker is currently unlocked (if any) — used when the
  // drag completes, when a different marker is unlocked, when the map is
  // clicked elsewhere, and when Escape is pressed.
  const lockUnlockedMarker = () => {
    const current = unlockedRef.current;
    if (!current) return;
    current.marker.dragging?.disable();
    current.marker.getElement()?.classList.remove('flora-marker-unlocked');
    reattachMarkerToCluster(current.marker);
    unlockedRef.current = null;
  };

  // Arms exactly one marker for dragging. Markers are created non-draggable
  // (Section: safety) precisely so that panning/clicking around the map
  // never accidentally moves a tree — only an explicit double-click does.
  const unlockMarkerForDrag = (id: string, marker: L.Marker) => {
    if (unlockedRef.current?.id === id) return; // already unlocked
    lockUnlockedMarker(); // only one marker unlocked at a time
    liftMarkerForDrag(marker);
    marker.dragging?.enable();
    marker.getElement()?.classList.add('flora-marker-unlocked');
    unlockedRef.current = { id, marker };
    showToast('Marker unlocked — drag it now, or click elsewhere to lock');
  };

  // Create the cluster group once.
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
      unlockedRef.current = null;
      liftedForDragRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Safety net: clicking anywhere on the map that ISN'T the unlocked marker
  // itself re-locks it, so double-clicking to unlock and then changing your
  // mind never leaves a marker armed by accident. (The marker's own click/
  // dblclick handlers stop propagation, so this only fires for genuine
  // clicks elsewhere.) Escape does the same from the keyboard.
  useEffect(() => {
    function handleMapClick() {
      lockUnlockedMarker();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') lockUnlockedMarker();
    }
    map.on('click', handleMapClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      map.off('click', handleMapClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Diff trees against existing markers: add new, update moved/changed, remove gone.
  // Adds/removes are collected into arrays and applied via the cluster
  // group's bulk addLayers/removeLayers so a single edit at 10k+ records
  // doesn't trigger thousands of individual spatial-index recalculations.
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
        const isUnlocked = unlockedRef.current?.id === tree.id;
        const cur = existingMarker.getLatLng();
        if (cur.lat !== latlng.lat || cur.lng !== latlng.lng) {
          existingMarker.setLatLng(latlng);
        }
        existingMarker.setIcon(icon);
        existingMarker.setPopupContent(buildPopupContent(tree));
        // Never pull an unlocked (lifted) marker back into the cluster mid-drag.
        if (!isUnlocked && liftedForDragRef.current?.marker !== existingMarker) {
          const group = clusterGroupRef.current;
          if (group && !group.hasLayer(existingMarker) && !map.hasLayer(existingMarker)) {
            group.addLayer(existingMarker);
          }
        }
      } else {
        // draggable: false by default — this is the safety mechanism.
        // Panning/clicking around the map can never move a tree; only an
        // explicit double-click (below) arms this specific marker.
        //
        // NOTE: this marker deliberately has no bound tooltip. An earlier
        // revision bound one ("double-click to unlock...") to explain the
        // interaction, but Leaflet tooltips don't set pointer-events: none
        // by default — with markers this close together, an open tooltip
        // box can sit directly on top of a neighboring marker and swallow
        // the very clicks needed to select or double-click it. That's what
        // caused both the "harsh popup blocking the map" complaint and,
        // very likely, "dragging doesn't work" — clicks were landing on a
        // stray tooltip instead of the marker underneath it.
        const marker = L.marker(latlng, { icon, draggable: false, riseOnHover: true });
        marker.bindPopup(buildPopupContent(tree), { minWidth: 220 });

        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          selectTree(tree.id, 'map');
        });

        marker.on('dblclick', (e) => {
          L.DomEvent.stopPropagation(e);
          unlockMarkerForDrag(tree.id, marker);
        });

        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          updateTreeCoordinates(tree.id, pos.lat, pos.lng);
          showToast(`${tree.id} location updated`);
          // Re-lock immediately after the drop — dragging one tree should
          // never leave the next accidental drag armed too.
          lockUnlockedMarker();
        });

        // Delegate clicks on the popup's Edit/Delete buttons via a single
        // listener bound once (guarded by data-bound) instead of re-binding
        // a fresh listener every time the popup reopens — the previous
        // version added a new listener on every popupopen without ever
        // removing the old one, so listener count (and duplicate dispatched
        // events) grew every time the same marker's popup was reopened.
        marker.on('popupopen', () => {
          const el = marker.getPopup()?.getElement();
          if (!el || el.dataset.floraBound === 'true') return;
          el.dataset.floraBound = 'true';
          el.addEventListener('click', (evt) => {
            const target = evt.target as HTMLElement;
            if (target.closest('[data-action="edit"]')) {
              selectTree(tree.id, 'map');
              window.dispatchEvent(new CustomEvent('flora:edit-tree', { detail: { id: tree.id } }));
            } else if (target.closest('[data-action="unlock-drag"]')) {
              marker.closePopup();
              unlockMarkerForDrag(tree.id, marker);
            } else if (target.closest('[data-action="delete"]')) {
              window.dispatchEvent(new CustomEvent('flora:delete-tree', { detail: { id: tree.id } }));
            }
          });
        });

        toAdd.push(marker);
        byId.set(tree.id, marker);
      }
    }

    // Remove markers whose tree no longer exists in the (filtered) array.
    for (const [id, marker] of byId.entries()) {
      if (!seen.has(id)) {
        toRemove.push(marker);
        byId.delete(id);
      }
    }

    if (toRemove.length > 0) {
      // Close popups first — removing a layer whose popup is currently open
      // is what can corrupt the cluster group's spatial index and make the
      // whole layer appear to vanish (see file header comment).
      for (const marker of toRemove) {
        if (marker.isPopupOpen()) marker.closePopup();
        // A removed marker can't stay "unlocked" — drop any stale reference.
        if (unlockedRef.current?.marker === marker) unlockedRef.current = null;
        if (liftedForDragRef.current?.marker === marker) liftedForDragRef.current = null;
      }
      group.removeLayers(toRemove);
    }
    if (toAdd.length > 0) {
      group.addLayers(toAdd);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trees, selectedTreeId]);

  // Expose delete confirmation via a lightweight custom event so the popup's
  // plain DOM button can trigger the same store action + confirm dialog used
  // elsewhere in the app, without prop-drilling React handlers into Leaflet's
  // imperative popup HTML.
  useEffect(() => {
    function handleDelete(e: Event) {
      const id = (e as CustomEvent).detail?.id as string;
      if (!id) return;
      // Close the popup before the tree-array diff runs and removes this
      // marker, so we never ask the cluster group to remove a layer whose
      // popup is still open.
      markersById.current.get(id)?.closePopup();
      if (unlockedRef.current?.id === id) unlockedRef.current = null;
      if (liftedForDragRef.current?.marker === markersById.current.get(id)) {
        liftedForDragRef.current = null;
      }
      if (window.confirm(`Delete ${id}?\n\nThis will remove the tree from the current dataset.`)) {
        deleteTreeAction(id);
      }
    }
    window.addEventListener('flora:delete-tree', handleDelete);
    return () => window.removeEventListener('flora:delete-tree', handleDelete);
  }, [deleteTreeAction]);

  // Opens a marker's popup on request (e.g. after flying to it from a
  // spreadsheet row click or search result — Section 22/30).
  useEffect(() => {
    function handleOpenPopup(e: Event) {
      const id = (e as CustomEvent).detail?.id as string;
      const marker = markersById.current.get(id);
      marker?.openPopup();
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
      <div class="flora-popup-hint">Use Move on map, or double-click the marker pin (not this popup)</div>
      <div class="flora-popup-actions">
        <button data-action="unlock-drag" type="button">Move on map</button>
        <button data-action="edit" type="button">Edit</button>
        <button data-action="delete" type="button" class="danger">Delete</button>
      </div>
    </div>
  `;
}
