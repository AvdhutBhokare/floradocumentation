import { booleanPointInPolygon, point as turfPoint, bbox as turfBbox } from '@turf/turf';
import type { ZoneFeature } from '../../types/tree';

/**
 * Returns the name of the zone whose polygon contains the given point, or
 * null if the point falls outside every known zone polygon. Only
 * Polygon/MultiPolygon zones participate in detection (line/point zone
 * layers can't contain anything).
 */
export function detectZoneForPoint(
  lat: number,
  lng: number,
  zones: ZoneFeature[]
): string | null {
  const pt = turfPoint([lng, lat]);
  for (const zone of zones) {
    if (zone.geometry.type !== 'Polygon' && zone.geometry.type !== 'MultiPolygon') continue;
    try {
      if (booleanPointInPolygon(pt, zone.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon)) {
        return zone.name;
      }
    } catch {
      // Malformed ring — skip this zone rather than crash detection for the whole map.
      continue;
    }
  }
  return null;
}

/** [south, west, north, east] bounding box across a set of zones, for map fit. */
export function boundsForZones(zones: ZoneFeature[]): [[number, number], [number, number]] | null {
  if (zones.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const zone of zones) {
    try {
      const [bMinX, bMinY, bMaxX, bMaxY] = turfBbox(zone.geometry);
      minX = Math.min(minX, bMinX);
      minY = Math.min(minY, bMinY);
      maxX = Math.max(maxX, bMaxX);
      maxY = Math.max(maxY, bMaxY);
    } catch {
      continue;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return [
    [minY, minX],
    [maxY, maxX],
  ];
}

export function boundsForSingleZone(zone: ZoneFeature): [[number, number], [number, number]] | null {
  try {
    const [minX, minY, maxX, maxY] = turfBbox(zone.geometry);
    return [
      [minY, minX],
      [maxY, maxX],
    ];
  } catch {
    return null;
  }
}
