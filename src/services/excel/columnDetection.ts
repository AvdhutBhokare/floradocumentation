import type { ColumnMapping } from '../../types/tree';

/**
 * Candidate header names for each canonical field, ordered roughly by how
 * strong/unambiguous a match they are. Matching is case-insensitive and
 * ignores punctuation/whitespace differences.
 */
const CANDIDATES: Record<keyof ColumnMapping, string[]> = {
  speciesName: [
    'tree species name', 'species name', 'tree species', 'species',
    'botanical name', 'scientific name', 'plant species', 'plant name',
  ],
  latitude: ['latitude', 'lat', 'y coordinate', 'y coord', 'y'],
  longitude: ['longitude', 'long', 'lng', 'lon', 'x coordinate', 'x coord', 'x'],
  zoneName: ['zone name', 'zone', 'site name', 'area', 'block', 'compartment', 'site zone'],
  treeStatus: [
    'existing tree / new tree', 'existing tree/new tree', 'existing/new',
    'status', 'tree status', 'existing or new', 'record type',
  ],
  height: ['height', 'tree height', 'height (m)', 'height m', 'ht'],
};

function normalize(header: string): string {
  return header
    .toLowerCase()
    .replace(/[_\-./]/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Scores how well a header matches a field's candidate list.
 * Returns 0 (no match) to 100 (exact match).
 */
function scoreMatch(header: string, candidates: string[]): number {
  const h = normalize(header);
  for (const c of candidates) {
    if (h === c) return 100;
  }
  for (const c of candidates) {
    if (h.includes(c) || c.includes(h)) return 70;
  }
  // token overlap fallback
  const hTokens = new Set(h.split(' '));
  let best = 0;
  for (const c of candidates) {
    const cTokens = c.split(' ');
    const overlap = cTokens.filter((t) => hTokens.has(t)).length;
    const score = (overlap / cTokens.length) * 50;
    if (score > best) best = score;
  }
  return best;
}

export interface DetectionResult {
  mapping: ColumnMapping;
  /** confidence 0-100 per field, useful to decide whether to prompt the user */
  confidence: Record<keyof ColumnMapping, number>;
}

/**
 * Detects the best header match for each canonical field. Never assumes
 * fixed column positions — always scans header names.
 */
export function detectColumns(headers: string[]): DetectionResult {
  const mapping: ColumnMapping = {};
  const confidence: Record<string, number> = {};
  const used = new Set<string>();

  (Object.keys(CANDIDATES) as (keyof ColumnMapping)[]).forEach((field) => {
    let bestHeader: string | undefined;
    let bestScore = 0;
    for (const header of headers) {
      if (used.has(header)) continue;
      const score = scoreMatch(header, CANDIDATES[field]);
      if (score > bestScore) {
        bestScore = score;
        bestHeader = header;
      }
    }
    if (bestHeader && bestScore >= 40) {
      mapping[field] = bestHeader;
      confidence[field] = bestScore;
      used.add(bestHeader);
    } else {
      confidence[field] = 0;
    }
  });

  return { mapping, confidence: confidence as Record<keyof ColumnMapping, number> };
}

export const CONFIDENCE_THRESHOLD_AUTO = 70;
