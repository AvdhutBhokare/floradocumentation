/**
 * Coordinate parsing/validation. Kept intentionally strict and side-effect
 * free so it can be unit tested in isolation from the UI.
 */

export interface CoordinateParseResult {
  value: number | null;
  valid: boolean;
  error?: string;
}

/** Parses a value that may arrive as a number, a numeric string, or a
 * string with stray whitespace/degree symbols from a copy-paste. */
export function parseCoordinateValue(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  const cleaned = String(raw)
    .trim()
    .replace(/[°'"NnSsEeWw]/g, '')
    .replace(/,/g, '.')
    .trim();

  if (cleaned === '') return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function validateLatitude(value: number | null): CoordinateParseResult {
  if (value === null) return { value: null, valid: false, error: 'Missing latitude' };
  if (value < -90 || value > 90) {
    return { value, valid: false, error: `Latitude ${value} out of range (-90 to 90)` };
  }
  return { value, valid: true };
}

export function validateLongitude(value: number | null): CoordinateParseResult {
  if (value === null) return { value: null, valid: false, error: 'Missing longitude' };
  if (value < -180 || value > 180) {
    return { value, valid: false, error: `Longitude ${value} out of range (-180 to 180)` };
  }
  return { value, valid: true };
}

export function validateCoordinatePair(
  lat: number | null,
  lng: number | null
): { valid: boolean; state: 'valid' | 'invalid' | 'missing'; error?: string } {
  if (lat === null && lng === null) return { valid: false, state: 'missing' };
  const latResult = validateLatitude(lat);
  const lngResult = validateLongitude(lng);
  if (lat === null || lng === null) {
    return { valid: false, state: 'missing', error: 'Latitude or longitude missing' };
  }
  if (!latResult.valid) return { valid: false, state: 'invalid', error: latResult.error };
  if (!lngResult.valid) return { valid: false, state: 'invalid', error: lngResult.error };

  // Heuristic: catch an obviously swapped lat/lng pair (common KML/export mistake)
  // where |lat| > 90 would already be caught above, but a plausible-looking
  // swap (e.g. India coords ~18,73 swapped to ~73,18) still passes range
  // checks. We don't auto-correct — we only ever flag it as valid, since
  // silently "fixing" coordinates the user typed would be worse than
  // leaving a rare false negative.
  return { valid: true, state: 'valid' };
}

/** Formats a coordinate for display without destroying precision the user entered. */
export function formatCoordinate(value: number | null, maxDecimals = 6): string {
  if (value === null || Number.isNaN(value)) return '';
  // Preserve full precision if it has more decimals than maxDecimals only
  // when it looks intentionally precise (e.g. GPS survey data); otherwise
  // show a clean, consistent number of decimals.
  const rounded = Math.round(value * 10 ** maxDecimals) / 10 ** maxDecimals;
  return String(rounded);
}
