import { describe, it, expect, afterEach } from 'vitest';
import L from 'leaflet';

/**
 * The double-click-to-unlock dragging feature (TreeMarkerLayer.tsx) relies
 * on one specific Leaflet behavior: a marker created with `draggable:
 * false` still gets a working `marker.dragging` handler once added to a
 * map — Leaflet always constructs it in `_initInteraction()`, it just
 * doesn't call `.enable()` on it. If that assumption were wrong,
 * `marker.dragging?.enable()` would silently no-op (optional chaining on
 * undefined) and double-clicking a marker would never make it draggable.
 * This test pins that behavior down directly against the real library
 * rather than trusting a read of its source.
 */
describe('marker drag lock/unlock (safety mechanism for dragging markers)', () => {
  let container: HTMLDivElement;
  let map: L.Map;

  afterEach(() => {
    map?.remove();
    container?.remove();
  });

  function makeMap() {
    container = document.createElement('div');
    container.style.width = '400px';
    container.style.height = '400px';
    document.body.appendChild(container);
    map = L.map(container, { attributionControl: false }).setView([18.52, 73.85], 16);
    return map;
  }

  it('a marker created with draggable: false still has a usable dragging handler once added to the map', () => {
    const m = makeMap();
    const marker = L.marker([18.52, 73.85], { draggable: false });
    marker.addTo(m);

    expect(marker.dragging).toBeDefined();
    expect(marker.dragging?.enabled()).toBe(false);

    expect(() => marker.dragging?.enable()).not.toThrow();
    expect(marker.dragging?.enabled()).toBe(true);

    expect(() => marker.dragging?.disable()).not.toThrow();
    expect(marker.dragging?.enabled()).toBe(false);
  });

  it('enabling dragging adds the leaflet-marker-draggable class; disabling removes it', () => {
    const m = makeMap();
    const marker = L.marker([18.52, 73.85], { draggable: false });
    marker.addTo(m);

    const el = marker.getElement();
    expect(el?.classList.contains('leaflet-marker-draggable')).toBe(false);

    marker.dragging?.enable();
    expect(el?.classList.contains('leaflet-marker-draggable')).toBe(true);

    marker.dragging?.disable();
    expect(el?.classList.contains('leaflet-marker-draggable')).toBe(false);
  });

  it('only one marker is ever unlocked at a time (simulated lock/unlock bookkeeping)', () => {
    // Mirrors TreeMarkerLayer's unlockedRef pattern directly, without
    // needing a full React/react-leaflet mount.
    const m = makeMap();
    const markerA = L.marker([18.52, 73.85], { draggable: false }).addTo(m);
    const markerB = L.marker([18.53, 73.86], { draggable: false }).addTo(m);

    let unlocked: { id: string; marker: L.Marker } | null = null;
    function lock() {
      if (!unlocked) return;
      unlocked.marker.dragging?.disable();
      unlocked = null;
    }
    function unlock(id: string, marker: L.Marker) {
      if (unlocked?.id === id) return;
      lock();
      marker.dragging?.enable();
      unlocked = { id, marker };
    }

    unlock('A', markerA);
    expect(markerA.dragging?.enabled()).toBe(true);
    expect(markerB.dragging?.enabled()).toBe(false);

    // Unlocking B must lock A first — never two draggable markers at once.
    unlock('B', markerB);
    expect(markerA.dragging?.enabled()).toBe(false);
    expect(markerB.dragging?.enabled()).toBe(true);

    lock();
    expect(markerB.dragging?.enabled()).toBe(false);
  });
});
