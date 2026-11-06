/**
 * IDB Cache Worker Service
 * 
 * Main-thread wrapper for the IDB Web Worker.
 * Provides a promise-based API for async IDB operations.
 * All heavy IDB work happens in the background thread.
 */

// Create worker instance (using Vite worker import syntax)
const worker = new Worker(
    new URL('../workers/idbCacheWorker.js', import.meta.url),
    { type: 'module' }
);

// Request ID counter for matching responses
let requestId = 0;

// Pending requests map
const pendingRequests = new Map();

// Handle messages from worker
worker.onmessage = (event) => {
    const { id, success, result, error } = event.data;

    const pending = pendingRequests.get(id);
    if (pending) {
        pendingRequests.delete(id);
        if (success) {
            pending.resolve(result);
        } else {
            pending.reject(new Error(error));
        }
    }
};

// Handle worker errors
worker.onerror = (error) => {
    console.error('[IDBWorkerService] Worker error:', error);
};

/**
 * Send a message to the worker and wait for response
 * @param {string} type - Message type
 * @param {object} payload - Additional data
 * @returns {Promise<any>}
 */
const sendMessage = (type, payload = {}) => {
    return new Promise((resolve, reject) => {
        const id = ++requestId;
        pendingRequests.set(id, { resolve, reject });

        worker.postMessage({ type, id, ...payload });

        // Timeout after 10 seconds
        setTimeout(() => {
            if (pendingRequests.has(id)) {
                pendingRequests.delete(id);
                reject(new Error('IDB Worker timeout'));
            }
        }, 10000);
    });
};

/**
 * Get metadata for an attachment URL
 * @param {string} url - Attachment URL
 * @returns {Promise<object|null>} - Metadata object or null
 */
export const getMetadata = (url) => {
    return sendMessage('get', { url }).catch(() => null);
};

/**
 * Save metadata for an attachment URL
 * @param {string} url - Attachment URL
 * @param {object} metadata - Metadata to save
 * @returns {Promise<boolean>}
 */
export const saveMetadata = (url, metadata) => {
    return sendMessage('save', { url, metadata }).catch(() => false);
};

/**
 * Touch metadata to update lastAccessed (fire-and-forget)
 * @param {string} url - Attachment URL
 */
export const touchMetadata = (url) => {
    // Fire-and-forget, don't wait for response
    worker.postMessage({ type: 'touch', id: ++requestId, url });
};

/**
 * Cleanup expired entries
 * @returns {Promise<boolean>}
 */
export const cleanupExpired = () => {
    return sendMessage('cleanup').catch(() => false);
};

/**
 * Initialize the worker (optional, happens automatically)
 * @returns {Promise<boolean>}
 */
export const initWorker = () => {
    return sendMessage('init').catch(() => false);
};

// Start cleanup on load (delayed to not block startup)
setTimeout(() => {
    cleanupExpired().catch(() => { });
}, 5000);
