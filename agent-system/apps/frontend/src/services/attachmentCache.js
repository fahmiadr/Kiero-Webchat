/**
 * Attachment Cache Service
 * 
 * IndexedDB wrapper for persistent attachment metadata storage.
 * Stores:
 * - Thumbnails (Data URLs)
 * - File Sizes (bytes)
 * - Durations (seconds)
 * 
 * Features:
 * - Max 20MB storage with LRU eviction
 * - 7-day expiry for old entries
 * - Robust error handling
 * 
 * @module services/attachmentCache
 */

const DB_NAME = 'AttachmentCache';
const DB_VERSION = 2; // Incremented for schema change (though name same, logic differs)
const STORE_NAME = 'metadata'; // Generic name
const MAX_STORAGE_BYTES = 50 * 1024 * 1024; // 50MB
// Stores: Thumbnails (video) AND Compressed Images (full blob as Base64)
const EXPIRY_DAYS = 7;

let dbInstance = null;

/**
 * Initialize IndexedDB connection
 * @returns {Promise<IDBDatabase>}
 */
const initDB = () => {
    // Check if existing connection is still valid
    if (dbInstance) {
        try {
            // Test if connection is still open by checking objectStoreNames
            if (dbInstance.objectStoreNames.contains(STORE_NAME)) {
                return Promise.resolve(dbInstance);
            }
        } catch {
            // Connection is stale, reset it
            dbInstance = null;
        }
    }

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);

        request.onsuccess = () => {
            dbInstance = request.result;

            // Handle connection close (version upgrade, forced close, etc.)
            dbInstance.onclose = () => {
                console.log('[AttachmentCache] IDB connection closed, will reconnect on next use');
                dbInstance = null;
            };

            // Handle version change (another tab upgraded the DB)
            dbInstance.onversionchange = () => {
                dbInstance.close();
                dbInstance = null;
            };

            resolve(dbInstance);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
                store.createIndex('lastAccessed', 'lastAccessed', { unique: false });
                store.createIndex('createdAt', 'createdAt', { unique: false });
            }
        };
    });
};

/**
 * Update the lastAccessed timestamp for an entry (Fire-and-forget)
 * @param {string} url 
 */
const touchMetadata = async (url) => {
    try {
        const db = await initDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(url);

        getReq.onsuccess = () => {
            const entry = getReq.result;
            if (entry) {
                // Only update if older than 1 hour to reduce write churn
                if (Date.now() - entry.lastAccessed > 60 * 60 * 1000) {
                    entry.lastAccessed = Date.now();
                    store.put(entry);
                }
            }
        };
    } catch { /* ignore background update errors */ }
};

/**
 * Get metadata from cache (ReadOnly - Fast)
 * @param {string} url - Attachment URL
 * @returns {Promise<Object|null>} - Metadata object ({ size, duration, thumbnail }) or null
 */
export const getMetadata = async (url) => {
    try {
        const db = await initDB();

        return new Promise((resolve) => {
            // OPTIMIZATION: Use 'readonly' to allow concurrent reads!
            // Previous 'readwrite' caused sequential locking -> UI Lag
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(url);

            request.onsuccess = () => {
                const entry = request.result;
                if (!entry) {
                    resolve(null);
                    return;
                }

                // Check expiry
                const expiryTime = EXPIRY_DAYS * 24 * 60 * 60 * 1000;
                if (Date.now() - entry.createdAt > expiryTime) {
                    // We can't delete in readonly tx. 
                    // Let the background cleanup or next write handle it.
                    // Just return null to effective expire it.
                    resolve(null);
                    return;
                }

                // Async update lastAccessed (Fire-and-forget)
                // OPTIMIZATION: Only open a write transaction if we actually need to update!
                // This prevents opening 100+ readwrite transactions during a fast scroll.
                if (!entry.lastAccessed || (Date.now() - entry.lastAccessed > 60 * 60 * 1000)) {
                    touchMetadata(url);
                }

                resolve(entry.metadata); // Return only the metadata payload
            };

            request.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
};

/**
 * Save metadata to cache
 * @param {string} url - Attachment URL
 * @param {Object} metadata - Metadata to store ({ size, duration, thumbnail })
 * @returns {Promise<boolean>} - Success status
 */
export const saveMetadata = async (url, metadata) => {
    try {
        const db = await initDB();

        // Calculate size of this entry (rough estimate)
        // JSON stringify is a decent approximation for storage cost
        // Calculate size of this entry
        let entrySize = url.length;
        if (metadata && typeof metadata === 'object') {
            // Precise size calculation for Blobs
            if (metadata.thumbnail instanceof Blob) {
                entrySize += metadata.thumbnail.size;
                // Add estimated size of other metadata fields
                entrySize += 100;
            } else {
                // Fallback for strings/JSON
                entrySize += JSON.stringify(metadata).length;
            }
        }

        // Evict old entries if needed
        await evictIfNeeded(db, entrySize);

        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            // Merge with existing if present (partial updates)
            const getReq = store.get(url);

            getReq.onsuccess = () => {
                const existing = getReq.result;
                const existingMeta = existing ? existing.metadata : {};

                const entry = {
                    url,
                    metadata: { ...existingMeta, ...metadata },
                    size: entrySize,
                    createdAt: existing ? existing.createdAt : Date.now(),
                    lastAccessed: Date.now()
                };

                const putReq = store.put(entry);
                putReq.onsuccess = () => resolve(true);
                putReq.onerror = () => resolve(false);
            };

            getReq.onerror = () => {
                // Determine failure, try fresh insert
                const entry = {
                    url,
                    metadata,
                    size: entrySize,
                    createdAt: Date.now(),
                    lastAccessed: Date.now()
                };
                store.put(entry);
                resolve(true);
            };
        });
    } catch {
        return false;
    }
};

/**
 * LRU eviction when storage quota exceeded
 * @param {IDBDatabase} db 
 * @param {number} neededBytes 
 */
const evictIfNeeded = async (db, neededBytes) => {
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const entries = request.result || [];
            let totalSize = entries.reduce((sum, e) => sum + (e.size || 0), 0);

            if (totalSize + neededBytes <= MAX_STORAGE_BYTES) {
                resolve();
                return;
            }

            // Sort by lastAccessed (oldest first)
            entries.sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));

            for (const entry of entries) {
                if (totalSize + neededBytes <= MAX_STORAGE_BYTES) break;
                store.delete(entry.url);
                totalSize -= entry.size || 0;
            }
            resolve();
        };

        request.onerror = () => resolve();
    });
};

/**
 * Clean up expired entries (call on app init)
 */
export const cleanupExpired = async () => {
    try {
        const db = await initDB();
        const expiryTime = EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        const cutoff = Date.now() - expiryTime;

        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('createdAt');
        const range = IDBKeyRange.upperBound(cutoff);

        const request = index.openCursor(range);

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
    } catch {
        // Ignore
    }
};

// Aliases for backward compatibility (transition period)
export const getThumbnail = async (url) => {
    const meta = await getMetadata(url);
    return meta?.thumbnail || null;
};

export const saveThumbnail = async (url, thumbnail) => {
    return saveMetadata(url, { thumbnail });
};

// Auto-cleanup
cleanupExpired();
