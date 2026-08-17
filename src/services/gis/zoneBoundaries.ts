import type { ZoneFeature } from '../../types/tree';

/** True for polygon geometries that represent a zone/site boundary on the map. */
export function isBoundaryGeometry(geometry: GeoJSON.Geometry): boolean {
  return geometry.type === 'Polygon' || geometry.type === 'MultiPolygon';
}

export function filterBoundaryZones(zones: ZoneFeature[]): ZoneFeature[] {
  return zones.filter((z) => isBoundaryGeometry(z.geometry));
}
