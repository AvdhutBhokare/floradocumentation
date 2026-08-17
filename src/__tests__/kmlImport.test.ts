import { describe, it, expect } from 'vitest';
import { parseKmlFile, KmlImportError } from '../services/kml/importKml';

const SAMPLE_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>Test Zones</name>
  <Placemark>
    <name>Zone A</name>
    <Polygon>
      <outerBoundaryIs>
        <LinearRing>
          <coordinates>73.856,18.520,0 73.858,18.520,0 73.858,18.522,0 73.856,18.522,0 73.856,18.520,0</coordinates>
        </LinearRing>
      </outerBoundaryIs>
    </Polygon>
  </Placemark>
  <Placemark>
    <name>Zone B</name>
    <Polygon>
      <outerBoundaryIs>
        <LinearRing>
          <coordinates>73.858,18.520,0 73.860,18.520,0 73.860,18.522,0 73.858,18.522,0 73.858,18.520,0</coordinates>
        </LinearRing>
      </outerBoundaryIs>
    </Polygon>
  </Placemark>
</Document>
</kml>`;

function makeFile(contents: string, name = 'test.kml'): File {
  return new File([contents], name, { type: 'application/vnd.google-earth.kml+xml' });
}

describe('parseKmlFile', () => {
  it('parses named zone polygons', async () => {
    const zones = await parseKmlFile(makeFile(SAMPLE_KML));
    expect(zones).toHaveLength(2);
    expect(zones.map((z) => z.name).sort()).toEqual(['Zone A', 'Zone B']);
  });

  it('keeps GeoJSON coordinates in [lng, lat] order — never swaps them (Section 12)', async () => {
    const zones = await parseKmlFile(makeFile(SAMPLE_KML));
    const zoneA = zones.find((z) => z.name === 'Zone A')!;
    expect(zoneA.geometry.type).toBe('Polygon');
    const ring = (zoneA.geometry as GeoJSON.Polygon).coordinates[0];
    const [lng, lat] = ring[0];
    // KML source was "73.856,18.520,0" i.e. lng=73.856, lat=18.520
    expect(lng).toBeCloseTo(73.856);
    expect(lat).toBeCloseTo(18.52);
  });

  it('assigns each zone a distinct color', async () => {
    const zones = await parseKmlFile(makeFile(SAMPLE_KML));
    expect(zones[0].color).not.toBe(zones[1].color);
  });

  it('rejects an empty file', async () => {
    await expect(parseKmlFile(makeFile(''))).rejects.toThrow(KmlImportError);
  });

  it('rejects malformed XML instead of crashing (Section 54)', async () => {
    await expect(parseKmlFile(makeFile('<kml><Document><Placemark>'))).rejects.toThrow();
  });

  it('auto-names unnamed placemarks rather than dropping them', async () => {
    const unnamedKml = SAMPLE_KML.replace('<name>Zone B</name>', '');
    const zones = await parseKmlFile(makeFile(unnamedKml));
    expect(zones.some((z) => z.name.startsWith('Zone '))).toBe(true);
  });

  it('imports polygon boundaries but skips point and line placemarks', async () => {
    const mixedKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <Placemark>
    <name>Zone A</name>
    <Polygon>
      <outerBoundaryIs>
        <LinearRing>
          <coordinates>73.856,18.520,0 73.858,18.520,0 73.858,18.522,0 73.856,18.522,0 73.856,18.520,0</coordinates>
        </LinearRing>
      </outerBoundaryIs>
    </Polygon>
  </Placemark>
  <Placemark>
    <name>Tree pin</name>
    <Point><coordinates>73.857,18.521,0</coordinates></Point>
  </Placemark>
  <Placemark>
    <name>Track</name>
    <LineString>
      <coordinates>73.856,18.520,0 73.858,18.522,0</coordinates>
    </LineString>
  </Placemark>
</Document>
</kml>`;
    const zones = await parseKmlFile(makeFile(mixedKml));
    expect(zones).toHaveLength(1);
    expect(zones[0].name).toBe('Zone A');
    expect(zones[0].geometry.type).toBe('Polygon');
  });
});
