import { useMemo } from 'react';
import { useFloraStore } from './useFloraStore';
import type { TreeRecord, ZoneReviewStatus } from '../types/tree';
import { filterBoundaryZones } from '../services/gis/zoneBoundaries';

export function isTreeMapped(t: TreeRecord): boolean {
  return t.latitude !== null && t.longitude !== null;
}

export function isTreeComplete(t: TreeRecord): boolean {
  return Boolean(
    t.speciesName.trim() &&
      t.latitude !== null &&
      t.longitude !== null &&
      t.zoneName.trim() &&
      t.height !== null
  );
}

export function useFilteredTrees(): TreeRecord[] {
  const trees = useFloraStore((s) => s.trees);
  const filters = useFloraStore((s) => s.filters);
  const zoneReview = useFloraStore((s) => s.zoneReview);

  return useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const reviewByZone = new Map(zoneReview.map((z) => [z.zoneName, z.status]));
    return trees.filter((t) => {
      if (filters.zone && t.zoneName !== filters.zone) return false;
      if (filters.species && t.speciesName !== filters.species) return false;
      if (filters.status && t.treeStatus !== filters.status) return false;
      if (filters.mapped === 'mapped' && !isTreeMapped(t)) return false;
      if (filters.mapped === 'unmapped' && isTreeMapped(t)) return false;
      if (filters.complete === 'complete' && !isTreeComplete(t)) return false;
      if (filters.complete === 'incomplete' && isTreeComplete(t)) return false;
      if (filters.reviewStatus) {
        const status = reviewByZone.get(t.zoneName) ?? 'Not Reviewed';
        if (status !== filters.reviewStatus) return false;
      }
      if (search) {
        const haystack = [
          t.id,
          t.speciesName,
          t.zoneName,
          t.treeStatus,
          String(t.latitude ?? ''),
          String(t.longitude ?? ''),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }, [trees, filters, zoneReview]);
}

export interface ZoneStats {
  zoneName: string;
  total: number;
  existing: number;
  newTrees: number;
  mapped: number;
  incomplete: number;
  reviewStatus: ZoneReviewStatus;
}

export function useZoneStatsList(): ZoneStats[] {
  const trees = useFloraStore((s) => s.trees);
  const zones = useFloraStore((s) => s.zones);
  const zoneReview = useFloraStore((s) => s.zoneReview);

  return useMemo(() => {
    const zoneNames = new Set<string>();
    filterBoundaryZones(zones).forEach((z) => zoneNames.add(z.name));
    trees.forEach((t) => {
      if (t.zoneName) zoneNames.add(t.zoneName);
    });

    const reviewByName = new Map(zoneReview.map((z) => [z.zoneName, z.status]));

    return [...zoneNames].sort().map((zoneName) => {
      const zoneTrees = trees.filter((t) => t.zoneName === zoneName);
      return {
        zoneName,
        total: zoneTrees.length,
        existing: zoneTrees.filter((t) => t.treeStatus === 'Existing').length,
        newTrees: zoneTrees.filter((t) => t.treeStatus === 'New').length,
        mapped: zoneTrees.filter(isTreeMapped).length,
        incomplete: zoneTrees.filter((t) => !isTreeComplete(t)).length,
        reviewStatus: reviewByName.get(zoneName) ?? 'Not Reviewed',
      };
    });
  }, [trees, zones, zoneReview]);
}

export interface DashboardStats {
  total: number;
  existing: number;
  newTrees: number;
  zones: number;
  mapped: number;
  unmapped: number;
  incomplete: number;
}

export function useDashboardStats(): DashboardStats {
  const trees = useFloraStore((s) => s.trees);
  const zones = useFloraStore((s) => s.zones);

  return useMemo(() => {
    const zoneNames = new Set<string>();
    filterBoundaryZones(zones).forEach((z) => zoneNames.add(z.name));
    trees.forEach((t) => {
      if (t.zoneName) zoneNames.add(t.zoneName);
    });
    const mapped = trees.filter(isTreeMapped).length;
    return {
      total: trees.length,
      existing: trees.filter((t) => t.treeStatus === 'Existing').length,
      newTrees: trees.filter((t) => t.treeStatus === 'New').length,
      zones: zoneNames.size,
      mapped,
      unmapped: trees.length - mapped,
      incomplete: trees.filter((t) => !isTreeComplete(t)).length,
    };
  }, [trees, zones]);
}

export function useSpeciesList(): string[] {
  const trees = useFloraStore((s) => s.trees);
  return useMemo(() => {
    const set = new Set<string>();
    trees.forEach((t) => {
      if (t.speciesName.trim()) set.add(t.speciesName.trim());
    });
    return [...set].sort();
  }, [trees]);
}

export function useZoneNameList(): string[] {
  const trees = useFloraStore((s) => s.trees);
  const zones = useFloraStore((s) => s.zones);
  return useMemo(() => {
    const set = new Set<string>();
    filterBoundaryZones(zones).forEach((z) => set.add(z.name));
    trees.forEach((t) => {
      if (t.zoneName.trim()) set.add(t.zoneName.trim());
    });
    return [...set].sort();
  }, [trees, zones]);
}
