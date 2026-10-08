import { RECORDING_CONTENT_TYPE, type ChunkSink, type RecordingTrack } from './recorder';

const DATABASE = 'agency-os-recordings';
const STORE = 'chunks';
const ENGAGEMENT_INDEX = 'engagement';

type StoredChunk = { engagementId: string; track: RecordingTrack; chunk: Blob };

export type PendingTracks = { client: Blob; studio: Blob | null };

export type PendingStore = ChunkSink & {
  load(): Promise<PendingTracks | null>;
  clear(): Promise<void>;
};

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.addEventListener('success', () => resolve(operation.result));
    operation.addEventListener('error', () => reject(operation.error));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  const opening = indexedDB.open(DATABASE, 1);
  opening.addEventListener('upgradeneeded', () => {
    const store = opening.result.createObjectStore(STORE, { autoIncrement: true });
    store.createIndex(ENGAGEMENT_INDEX, 'engagementId');
  });
  return request(opening);
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await run(database.transaction(STORE, mode).objectStore(STORE));
  } finally {
    database.close();
  }
}

const unavailable: PendingStore = {
  async append() {},
  async load() {
    return null;
  },
  async clear() {},
};

/**
 * Keeps the chunks of an ongoing recording in the browser so that a closed or reloaded page can
 * still upload the call. Browsers without IndexedDB record without this safety net.
 */
export function openPendingStore(engagementId: string): PendingStore {
  if (typeof indexedDB === 'undefined') return unavailable;
  return {
    async append(track, chunk) {
      await withStore('readwrite', (store) =>
        request(store.add({ engagementId, track, chunk } satisfies StoredChunk)),
      );
    },
    async load() {
      const chunks = await withStore('readonly', (store) =>
        request(store.index(ENGAGEMENT_INDEX).getAll(engagementId) as IDBRequest<StoredChunk[]>),
      );
      const parts = (track: RecordingTrack) =>
        chunks.filter((entry) => entry.track === track).map((entry) => entry.chunk);
      const client = parts('client');
      if (client.length === 0) return null;
      const studio = parts('studio');
      return {
        client: new Blob(client, { type: RECORDING_CONTENT_TYPE }),
        studio: studio.length > 0 ? new Blob(studio, { type: RECORDING_CONTENT_TYPE }) : null,
      };
    },
    async clear() {
      await withStore('readwrite', async (store) => {
        const keys = await request(store.index(ENGAGEMENT_INDEX).getAllKeys(engagementId));
        await Promise.all(keys.map((key) => request(store.delete(key))));
      });
    },
  };
}
