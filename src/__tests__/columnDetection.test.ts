import { describe, it, expect } from 'vitest';
import { detectColumns } from '../services/excel/columnDetection';

describe('detectColumns', () => {
  it('detects exact canonical header names', () => {
    const { mapping } = detectColumns([
      'Tree Species Name',
      'Latitude',
      'Longitude',
      'Zone Name',
      'Existing Tree / New Tree',
      'Height',
    ]);
    expect(mapping.speciesName).toBe('Tree Species Name');
    expect(mapping.latitude).toBe('Latitude');
    expect(mapping.longitude).toBe('Longitude');
    expect(mapping.zoneName).toBe('Zone Name');
    expect(mapping.treeStatus).toBe('Existing Tree / New Tree');
    expect(mapping.height).toBe('Height');
  });

  it('detects common abbreviated / alternate headers (Section 7)', () => {
    const { mapping } = detectColumns(['Species', 'Lat', 'Long', 'Zone', 'Status', 'Height (m)']);
    expect(mapping.speciesName).toBe('Species');
    expect(mapping.latitude).toBe('Lat');
    expect(mapping.longitude).toBe('Long');
    expect(mapping.zoneName).toBe('Zone');
    expect(mapping.treeStatus).toBe('Status');
    expect(mapping.height).toBe('Height (m)');
  });

  it('does not assume fixed column position — order should not matter', () => {
    const a = detectColumns(['Longitude', 'Latitude', 'Species']);
    const b = detectColumns(['Species', 'Latitude', 'Longitude']);
    expect(a.mapping.speciesName).toBe('Species');
    expect(a.mapping.latitude).toBe('Latitude');
    expect(a.mapping.longitude).toBe('Longitude');
    expect(b.mapping).toEqual(a.mapping);
  });

  it('never maps two canonical fields to the same header', () => {
    const { mapping } = detectColumns(['Lat', 'Long', 'Latitude Notes']);
    const values = Object.values(mapping).filter(Boolean);
    expect(new Set(values).size).toBe(values.length);
  });

  it('leaves a field unmapped when nothing plausible exists', () => {
    const { mapping } = detectColumns(['Random Column A', 'Random Column B']);
    expect(mapping.latitude).toBeUndefined();
    expect(mapping.longitude).toBeUndefined();
  });

  it('preserves extra/unmapped columns by leaving them out of the mapping', () => {
    const { mapping } = detectColumns(['Species', 'Latitude', 'Longitude', 'Remarks', 'Surveyor', 'DBH']);
    const mappedValues = new Set(Object.values(mapping));
    expect(mappedValues.has('Remarks')).toBe(false);
    expect(mappedValues.has('Surveyor')).toBe(false);
    expect(mappedValues.has('DBH')).toBe(false);
  });
});
