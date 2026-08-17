import { openDB, type IDBPDatabase } from 'idb';
import type { TreeRecord, ZoneFeature, ZoneReviewState, ProjectMeta } from '../../types/tree';

const DB_NAME = 'flora-gis-manager';
const DB_VERSION = 1;

interface FloraSchema {
  meta: ProjectMeta & { key: 'project' };
  trees: TreeRecord[];
  zones: ZoneFeature[];
  zoneReview: ZoneReviewState[];
}

const STORE_STATE = 'appState'; // single-row store holding the whole snapshot

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_STATE)) {
          db.createObjectStore(STORE_STATE);
        }
      },
    });
  }
  return dbPromise;
}

export interface PersistedState {
  meta: ProjectMeta;
  trees: TreeRecord[];
  zones: ZoneFeature[];
  zoneReview: ZoneReviewState[];
}

const SNAPSHOT_KEY = 'currentProject';

export async function saveSnapshot(state: PersistedState): Promise<void> {
  const db = await getDb();
  await db.put(STORE_STATE, state, SNAPSHOT_KEY);
}

export async function loadSnapshot(): Promise<PersistedState | undefined> {
  const db = await getDb();
  return db.get(STORE_STATE, SNAPSHOT_KEY);
}

export async function clearSnapshot(): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_STATE, SNAPSHOT_KEY);
}

// Re-exported for reuse elsewhere without pulling in idb types directly.
export type { FloraSchema };
