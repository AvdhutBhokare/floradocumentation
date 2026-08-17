import { kml as kmlToGeoJson } from '@tmcw/togeojson';
import { v4 as uuid } from 'uuid';
import type { ZoneFeature } from '../../types/tree';
import { nextZoneColor } from '../../utils/ids';

export class KmlImportError extends Error {}

/**
 * Parses a KML File into ZoneFeature polygons/lines.
 *
 * KML coordinates are stored as "longitude,latitude,altitude". The DOM
 * parser + @tmcw/togeojson conversion already produces standard GeoJSON
 * ([lng, lat] order, WGS84 / EPSG:4326), so nothing here re-orders
 * coordinates — doing so would risk the exact lat/lng swap the spec warns
 * against. We only ever consume the resulting GeoJSON as-is.
 */
export async function parseKmlFile(file: File): Promise<ZoneFeature[]> {
  const text = await file.text();
  if (!text.trim()) {
    throw new KmlImportError(`"${file.name}" is empty.`);
  }

  let dom: Document;
  try {
    const parser = new DOMParser();
    dom = parser.parseFromString(text, 'text/xml');
    const parseError = dom.querySelector('parsererror');
    if (parseError) {
      throw new Error(parseError.textContent || 'XML parse error');
    }
  } catch (e) {
    throw new KmlImportError(
      `"${file.name}" could not be parsed as KML. ${e instanceof Error ? e.message : ''}`
    );
  }

  let geojson: GeoJSON.FeatureCollection;
  try {
    geojson = kmlToGeoJson(dom) as GeoJSON.FeatureCollection;
  } catch (e) {
    throw new KmlImportError(
      `"${file.name}" contains KML that could not be converted to GeoJSON. ${
        e instanceof Error ? e.message : ''
      }`
    );
  }

  if (!geojson.features || geojson.features.length === 0) {
    throw new KmlImportError(`"${file.name}" does not contain any recognizable geometry.`);
  }

  const zones: ZoneFeature[] = [];
  let unnamedCount = 0;
  let skippedNonBoundary = 0;

  for (const feature of geojson.features) {
    if (!feature.geometry) continue;

    // Zone boundaries are polygons only. Real-world KML exports often bundle
    // point placemarks (tree pins with custom icons) and GPS track lines
    // alongside the actual boundary polygons — importing those as "zones"
    // renders broken icon images and spaghetti lines on the map.
    const boundaryTypes = ['Polygon', 'MultiPolygon'] as const;
    if (!boundaryTypes.includes(feature.geometry.type as (typeof boundaryTypes)[number])) {
      skippedNonBoundary++;
      continue;
    }

    let name =
      (feature.properties && (feature.properties.name as string)) || '';
    if (!name) {
      unnamedCount++;
      name = `Zone ${unnamedCount}`;
    }

    zones.push({
      id: uuid(),
      name,
      geometry: feature.geometry,
      color: nextZoneColor(),
      sourceFile: file.name,
    });
  }

  if (zones.length === 0) {
    const hint =
      skippedNonBoundary > 0
        ? ` Found ${skippedNonBoundary} point/line feature(s) which are not zone boundaries — only polygon boundaries are imported.`
        : '';
    throw new KmlImportError(
      `"${file.name}" was parsed but contained no polygon zone boundaries.${hint}`
    );
  }

  return zones;
}
