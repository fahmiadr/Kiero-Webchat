/**
 * IndexedDB Web Worker for Attachment Caching
 * 
 * Offloads all IDB operations to a background thread to prevent main thread blocking.
 * This is the ROOT CAUSE fix for image lag - IDB operations were blocking the UI.
 * 
 * Messages:
 * - { type: 'init' } - Initialize the database
 * - { type: 'get', url } - Get metadata for a URL
 * - { type: 'save', url, metadata } - Save metadata for a URL
 * - { type: 'touch', url } - Update lastAccessed timestamp
 * - { type: 'cleanup' } - Remove expired entries
 */

const DB_NAME = 'AttachmentCacheDB';
const DB_VERSION = 2;
const STORE_NAME = 'attachments';
const EXPIRY_DAYS = 7;

let db = null;

/**
 * Initialize IndexedDB connection
 */
const initDB = () => {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);

        request.onsuccess = () => {
            db = request.result;

            // Handle connection close
            db.onclose = () => {
                console.log('[IDBWorker] Connection closed');
                db = null;
            };

            // Handle version change from another tab
            db.onversionchange = () => {
                db.close();
                db = null;
            };

            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'url' });
                store.createIndex('lastAccessed', 'lastAccessed', { unique: false });
                store.createIndex('createdAt', 'createdAt', { unique: false });
            }
        };
    });
};

/**
 * Get metadata for a URL
 */
const getMetadata = async (url) => {
    const database = await initDB();

    return new Promise((resolve) => {
        const tx = database.transaction(STORE_NAME, 'readonly');
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
                resolve(null);
                return;
            }

            // Update lastAccessed if older than 1 hour (fire-and-forget)
            if (!entry.lastAccessed || (Date.now() - entry.lastAccessed > 60 * 60 * 1000)) {
                touchMetadata(url);
            }

            resolve(entry.metadata);
        };

        request.onerror = () => resolve(null);
    });
};

/**
 * Save metadata for a URL
 */
const saveMetadata = async (url, metadata) => {
    const database = await initDB();

    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        const entry = {
            url,
            metadata,
            createdAt: Date.now(),
            lastAccessed: Date.now()
        };

        const request = store.put(entry);

        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
};

/**
 * Update lastAccessed timestamp
 */
const touchMetadata = async (url) => {
    try {
        const database = await initDB();

        const tx = database.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(url);

        request.onsuccess = () => {
            const entry = request.result;
            if (entry) {
                entry.lastAccessed = Date.now();
                store.put(entry);
            }
        };
    } catch {
        // Ignore errors
    }
};

/**
 * Cleanup expired entries
 */
const cleanupExpired = async () => {
    try {
        const database = await initDB();
        const expiryTime = EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        const cutoffTime = Date.now() - expiryTime;

        const tx = database.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('createdAt');
        const range = IDBKeyRange.upperBound(cutoffTime);

        const request = index.openCursor(range);

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
    } catch {
        // Ignore errors
    }
};

// Message handler
self.onmessage = async (event) => {
    const { type, id, url, metadata } = event.data;

    try {
        let result = null;

        switch (type) {
            case 'init':
                await initDB();
                result = true;
                break;

            case 'get':
                result = await getMetadata(url);
                break;

            case 'save':
                result = await saveMetadata(url, metadata);
                break;

            case 'touch':
                touchMetadata(url);
                result = true;
                break;

            case 'cleanup':
                await cleanupExpired();
                result = true;
                break;

            default:
                throw new Error(`Unknown message type: ${type}`);
        }

        self.postMessage({ id, success: true, result });
    } catch (error) {
        self.postMessage({ id, success: false, error: error.message });
    }
};

// Initialize on load
initDB().catch(console.error);
