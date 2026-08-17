import { describe, it, expect } from 'vitest';
import { nextTreeId, nextTreeIdBatch } from '../utils/ids';

describe('nextTreeId', () => {
  it('starts at TREE-0001 for an empty dataset', () => {
    expect(nextTreeId([])).toBe('TREE-0001');
  });

  it('continues from the highest existing numeric suffix', () => {
    expect(nextTreeId(['TREE-0001', 'TREE-0002', 'TREE-0007'])).toBe('TREE-0008');
  });

  it('ignores non-conforming ids and unrelated ordering', () => {
    expect(nextTreeId(['TREE-0003', 'random-id', 'TREE-0001'])).toBe('TREE-0004');
  });

  it('is stable regardless of array order (never derived from row position)', () => {
    const a = nextTreeId(['TREE-0005', 'TREE-0002', 'TREE-0009']);
    const b = nextTreeId(['TREE-0009', 'TREE-0002', 'TREE-0005']);
    expect(a).toBe(b);
    expect(a).toBe('TREE-0010');
  });
});

describe('nextTreeIdBatch', () => {
  it('generates N sequential unique ids with no collisions', () => {
    const ids = nextTreeIdBatch(['TREE-0001', 'TREE-0002'], 5);
    expect(ids).toEqual(['TREE-0003', 'TREE-0004', 'TREE-0005', 'TREE-0006', 'TREE-0007']);
    expect(new Set(ids).size).toBe(5);
  });
});
