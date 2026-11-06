import { get, set, del } from 'idb-keyval';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

/**
 * Creates an IDB persister for TanStack Query
 * Uses idb-keyval which natively supports Blob storage via Structured Clone
 */
export const idbPersister = createAsyncStoragePersister({
    storage: {
        getItem: async (key) => {
            try {
                return await get(key);
            } catch (e) {
                console.error('IDB Read Error:', e);
                return null;
            }
        },
        setItem: async (key, value) => {
            try {
                await set(key, value);
            } catch (e) {
                console.error('IDB Write Error:', e);
            }
        },
        removeItem: async (key) => {
            try {
                await del(key);
            } catch (e) {
                console.error('IDB Delete Error:', e);
            }
        },
    },
    // Throttle saves to avoid performance hits during rapid progress updates (if any)
    throttleTime: 1000,
    // IDB supports objects/blobs natively via Structured Clone. 
    // We disable JSON serialization to store raw Blobs.
    serialize: clientData => clientData,
    deserialize: cachedData => cachedData,
});
