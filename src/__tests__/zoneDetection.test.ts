import { describe, it, expect } from 'vitest';
import { detectZoneForPoint, boundsForSingleZone } from '../services/gis/zoneDetection';
import type { ZoneFeature } from '../types/tree';

const zoneA: ZoneFeature = {
  id: 'z1',
  name: 'Zone A',
  color: '#4C8B5B',
  sourceFile: 'test.kml',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [73.856, 18.52],
        [73.858, 18.52],
        [73.858, 18.522],
        [73.856, 18.522],
        [73.856, 18.52],
      ],
    ],
  },
};

const zoneB: ZoneFeature = {
  id: 'z2',
  name: 'Zone B',
  color: '#3E7CB1',
  sourceFile: 'test.kml',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [73.858, 18.52],
        [73.86, 18.52],
        [73.86, 18.522],
        [73.858, 18.522],
        [73.858, 18.52],
      ],
    ],
  },
};

describe('detectZoneForPoint', () => {
  it('finds the zone containing a point inside its polygon', () => {
    expect(detectZoneForPoint(18.521, 73.857, [zoneA, zoneB])).toBe('Zone A');
    expect(detectZoneForPoint(18.521, 73.859, [zoneA, zoneB])).toBe('Zone B');
  });

  it('returns null for a point outside every zone', () => {
    expect(detectZoneForPoint(18.6, 73.9, [zoneA, zoneB])).toBeNull();
  });

  it('returns null when there are no zones', () => {
    expect(detectZoneForPoint(18.521, 73.857, [])).toBeNull();
  });
});

describe('boundsForSingleZone', () => {
  it('returns a [[south,west],[north,east]] bounding box', () => {
    const bounds = boundsForSingleZone(zoneA);
    expect(bounds).not.toBeNull();
    const [[south, west], [north, east]] = bounds!;
    expect(south).toBeCloseTo(18.52);
    expect(north).toBeCloseTo(18.522);
    expect(west).toBeCloseTo(73.856);
    expect(east).toBeCloseTo(73.858);
  });
});
