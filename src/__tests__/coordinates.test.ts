import { describe, it, expect } from 'vitest';
import {
  parseCoordinateValue,
  validateLatitude,
  validateLongitude,
  validateCoordinatePair,
} from '../utils/coordinates';

describe('parseCoordinateValue', () => {
  it('parses plain numbers', () => {
    expect(parseCoordinateValue(18.5204)).toBe(18.5204);
  });
  it('parses numeric strings', () => {
    expect(parseCoordinateValue('18.5204')).toBe(18.5204);
  });
  it('handles pasted values with degree symbols / stray characters', () => {
    expect(parseCoordinateValue('18.5204°N')).toBeCloseTo(18.5204);
  });
  it('returns null for empty / missing values', () => {
    expect(parseCoordinateValue('')).toBeNull();
    expect(parseCoordinateValue(undefined)).toBeNull();
    expect(parseCoordinateValue(null)).toBeNull();
  });
  it('returns null for garbage strings', () => {
    expect(parseCoordinateValue('not-a-number')).toBeNull();
  });
  it('preserves high precision decimals (Section 33)', () => {
    expect(parseCoordinateValue('18.520400123')).toBeCloseTo(18.520400123, 9);
  });
});

describe('validateLatitude / validateLongitude', () => {
  it('accepts values within range', () => {
    expect(validateLatitude(18.52).valid).toBe(true);
    expect(validateLongitude(73.86).valid).toBe(true);
  });
  it('rejects out-of-range latitude (Section 32)', () => {
    expect(validateLatitude(91).valid).toBe(false);
    expect(validateLatitude(-91).valid).toBe(false);
  });
  it('rejects out-of-range longitude', () => {
    expect(validateLongitude(181).valid).toBe(false);
    expect(validateLongitude(-181).valid).toBe(false);
  });
  it('accepts boundary values', () => {
    expect(validateLatitude(90).valid).toBe(true);
    expect(validateLatitude(-90).valid).toBe(true);
    expect(validateLongitude(180).valid).toBe(true);
    expect(validateLongitude(-180).valid).toBe(true);
  });
});

describe('validateCoordinatePair', () => {
  it('flags a fully missing pair as missing, not invalid', () => {
    const result = validateCoordinatePair(null, null);
    expect(result.state).toBe('missing');
    expect(result.valid).toBe(false);
  });
  it('flags a half-missing pair as missing', () => {
    expect(validateCoordinatePair(18.52, null).state).toBe('missing');
    expect(validateCoordinatePair(null, 73.86).state).toBe('missing');
  });
  it('flags an out-of-range pair as invalid', () => {
    expect(validateCoordinatePair(200, 73.86).state).toBe('invalid');
  });
  it('accepts a valid pair', () => {
    const result = validateCoordinatePair(18.52, 73.86);
    expect(result.state).toBe('valid');
    expect(result.valid).toBe(true);
  });
});
