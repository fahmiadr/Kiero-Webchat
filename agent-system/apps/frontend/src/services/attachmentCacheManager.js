import { keys, del } from 'idb-keyval';

/**
 * Attachment Cache Manager
 * 
 * Implements LRU (Least Recently Used) eviction strategy for IndexedDB cache.
 * Prevents unbounded cache growth.
 */

const MAX_CACHE_ITEMS = 200; // Maximum number of cached attachments

// In-memory LRU tracking (persists only for session, but sufficient for eviction decisions)
const accessTimes = new Map(); // { url: timestamp }

/**
 * Track access time for LRU eviction
 * Call this when a cached blob is read
 * 
 * @param {string} url - The attachment URL
 */
export const trackAccess = (url) => {
    if (!url || typeof url !== 'string') return;
    accessTimes.set(url, Date.now());
};

/**
 * Check if eviction is needed and remove least recently used items
 * Call this after saving a new blob to IDB
 * 
 * @returns {Promise<number>} Number of items evicted
 */
export const evictIfNeeded = async () => {
    try {
        const allKeys = await keys();

        // Filter to only attachment URLs (http/https)
        const attachmentKeys = allKeys.filter(k =>
            typeof k === 'string' &&
            (k.startsWith('http://') || k.startsWith('https://'))
        );

        if (attachmentKeys.length <= MAX_CACHE_ITEMS) {
            return 0; // No eviction needed
        }

        // Sort by LRU (least recently used first)
        // Items not in accessTimes map are considered oldest (timestamp 0)
        const sorted = attachmentKeys.sort((a, b) => {
            const timeA = accessTimes.get(a) || 0;
            const timeB = accessTimes.get(b) || 0;
            return timeA - timeB;
        });

        // Calculate how many to evict (remove oldest 20% when over limit)
        const evictCount = Math.max(
            attachmentKeys.length - MAX_CACHE_ITEMS,
            Math.floor(attachmentKeys.length * 0.2)
        );

        const toEvict = sorted.slice(0, evictCount);

        // Evict in parallel for speed
        await Promise.all(toEvict.map(async (key) => {
            try {
                await del(key);
                accessTimes.delete(key);
            } catch (e) {
                console.warn('[CacheManager] Failed to evict:', key, e);
            }
        }));

        console.info(`[CacheManager] Evicted ${toEvict.length} items`);
        return toEvict.length;

    } catch (error) {
        console.error('[CacheManager] Eviction failed:', error);
        return 0;
    }
};

/**
 * Get cache statistics
 * @returns {Promise<{ count: number, accessTracked: number }>}
 */
export const getCacheStats = async () => {
    const allKeys = await keys();
    const attachmentKeys = allKeys.filter(k =>
        typeof k === 'string' &&
        (k.startsWith('http://') || k.startsWith('https://'))
    );

    return {
        count: attachmentKeys.length,
        accessTracked: accessTimes.size,
        maxItems: MAX_CACHE_ITEMS
    };
};
