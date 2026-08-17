/**
 * Generates stable, human-readable Tree IDs like "TREE-0001".
 * IDs are never derived from row/array position so they stay valid across
 * sorts, filters, and edits.
 */
export function nextTreeId(existingIds: Iterable<string>): string {
  let max = 0;
  for (const id of existingIds) {
    const match = /^TREE-(\d+)$/.exec(id);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  const n = max + 1;
  return `TREE-${String(n).padStart(4, '0')}`;
}

/** Generates a batch of N sequential Tree IDs at once, useful for multi-row paste. */
export function nextTreeIdBatch(existingIds: Iterable<string>, count: number): string[] {
  let max = 0;
  for (const id of existingIds) {
    const match = /^TREE-(\d+)$/.exec(id);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  const ids: string[] = [];
  for (let i = 1; i <= count; i++) {
    ids.push(`TREE-${String(max + i).padStart(4, '0')}`);
  }
  return ids;
}

let zoneColorIndex = 0;
const ZONE_PALETTE = [
  '#4C8B5B', '#3E7CB1', '#B8792E', '#8B6FB0', '#C1503F',
  '#5FA8A0', '#A3A83E', '#D0955A', '#6B8CC7', '#9E5B8F',
];

export function nextZoneColor(): string {
  const c = ZONE_PALETTE[zoneColorIndex % ZONE_PALETTE.length];
  zoneColorIndex++;
  return c;
}

export function resetZoneColorCycle() {
  zoneColorIndex = 0;
}
