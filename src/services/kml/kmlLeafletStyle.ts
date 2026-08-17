import L from 'leaflet';
import type { PathOptions } from 'leaflet';

type KmlProps = Record<string, unknown>;

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

/** Path / polygon / line styling from KML Simplestyle fields produced by togeojson. */
export function kmlPathStyle(
  properties: KmlProps | null | undefined,
  fallbackColor: string
): PathOptions {
  const p = properties ?? {};
  const stroke = color(p.stroke, fallbackColor);
  return {
    color: stroke,
    weight: num(p['stroke-width'], 2),
    opacity: num(p['stroke-opacity'], 1),
    fillColor: color(p.fill, stroke),
    fillOpacity: num(p['fill-opacity'], 0.25),
  };
}

function usableIconUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const url = value.trim();
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  // KML often references relative icon paths (files/icon.png) — those cannot load in-browser.
  return null;
}

/** Renders KML point placemarks with their remote icon when possible, otherwise a styled dot. */
export function kmlPointToLayer(
  feature: GeoJSON.Feature,
  latlng: L.LatLng,
  fallbackColor: string
): L.Layer {
  const p = (feature.properties ?? {}) as KmlProps;
  const iconUrl =
    usableIconUrl(p.icon) ?? usableIconUrl(p['icon-url']) ?? usableIconUrl(p['marker-url']);

  if (iconUrl) {
    return L.marker(latlng, {
      icon: L.icon({
        iconUrl,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -28],
      }),
    });
  }

  const fill = color(p['marker-color'] ?? p.fill ?? p.stroke, fallbackColor);
  return L.circleMarker(latlng, {
    radius: num(p['marker-size'], 7),
    color: color(p.stroke, fill),
    weight: num(p['stroke-width'], 1.5),
    opacity: num(p['stroke-opacity'], 1),
    fillColor: fill,
    fillOpacity: num(p['fill-opacity'] ?? p['marker-opacity'], 0.85),
  });
}
