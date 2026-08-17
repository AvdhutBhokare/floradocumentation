import L from 'leaflet';
import type { TreeRecord } from '../../types/tree';

export type MarkerVisualState = 'existing' | 'new' | 'selected' | 'unsaved';

const COLORS: Record<MarkerVisualState, { fill: string; stroke: string }> = {
  existing: { fill: '#4C8B5B', stroke: '#2f5c3a' },
  new: { fill: '#3E7CB1', stroke: '#294f6c' },
  selected: { fill: '#E0A73A', stroke: '#8f6420' },
  unsaved: { fill: '#8B6FB0', stroke: '#5c4a78' },
};

function pinSvg(fill: string, stroke: string, size: number): string {
  return `<svg width="${size}" height="${size * 1.35}" viewBox="0 0 32 43" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 0C7.163 0 0 7.163 0 16c0 11 16 27 16 27s16-16 16-27C32 7.163 24.837 0 16 0z"
      fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
    <circle cx="16" cy="16" r="6.5" fill="#0c1210" fill-opacity="0.18"/>
    <circle cx="16" cy="16" r="5" fill="#fff"/>
  </svg>`;
}

export function markerVisualState(tree: TreeRecord, isSelected: boolean): MarkerVisualState {
  if (isSelected) return 'selected';
  if (tree.isUnsaved) return 'unsaved';
  return tree.treeStatus === 'Existing' ? 'existing' : 'new';
}

const iconCache = new Map<string, L.DivIcon>();

export function getTreeIcon(state: MarkerVisualState, size = 30): L.DivIcon {
  const key = `${state}-${size}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const { fill, stroke } = COLORS[state];
  const icon = L.divIcon({
    className: 'flora-tree-marker',
    html: pinSvg(fill, stroke, size),
    iconSize: [size, size * 1.35],
    iconAnchor: [size / 2, size * 1.35],
    popupAnchor: [0, -size * 1.1],
  });
  iconCache.set(key, icon);
  return icon;
}

export function legendColor(state: MarkerVisualState): string {
  return COLORS[state].fill;
}
