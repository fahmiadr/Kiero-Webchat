import { useQuery } from '@tanstack/react-query';
import api from '@/lib/axios';
import { get, set } from 'idb-keyval'; // Direct IDB access
import { pLimit } from '@/utils/concurrency'; // Switch to local utility
import useAttachmentProgressStore from '@/stores/useAttachmentProgressStore';
import { trackAccess, evictIfNeeded } from '@/services/attachmentCacheManager';
import { getMetadata, saveMetadata } from '@/services/attachmentCache';
import { generateThumbnail, generateVideoThumbnail } from '@/utils/generateThumbnail';
import { MIME_PREFIX_IMAGE, MIME_PREFIX_VIDEO } from '@/constants/fileTypes';

// Global concurrency limit for downloads
const limit = pLimit(3);

// Custom Adapter to support streaming via Axios

/**
 * Fetcher function that handles Manual Persistence 
 * (Check Disk -> Fetch Net -> Save Disk)
 */
// Custom Adapter to support streaming via Axios
const createFetchAdapter = () => async (config) => {
    const response = await fetch(config.url, {
        method: config.method.toUpperCase(),
        headers: config.headers,
        signal: config.signal
    });

    // Resolve or Reject based on status (Axios default: status >= 200 && status < 300)
    // We also want to handle 416 manually in the caller, but Axios throws on 4xx by default.
    // We can allow all statuses and validate in the caller, or let it throw.
    // Let's mimic standard behavior: throw if !ok.
    // BUT we need to handle 206 (Partial) which is OK.

    // Normalize headers to object
    const headers = {};
    response.headers.forEach((val, key) => { headers[key] = val; });

    return {
        data: response.body, // Return the stream as data
        status: response.status,
        statusText: response.statusText,
        headers,
        config,
        request: null
    };
};

const fetchAndCacheAttachment = async ({ queryKey, signal }) => {
    const url = queryKey[1];
    if (!url) return null;

    // OPTIMIZATION: Do not try to fetch 'blob:' URLs
    if (url.startsWith('blob:')) {
        return null;
    }

    // 1. Check Persistent Storage (Completed File)
    try {
        const cachedBlob = await get(url);
        if (cachedBlob instanceof Blob) {
            trackAccess(url);

            // Background: Check if thumbnail exists, if not generate it (Self-healing)
            if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                getMetadata(url).then(meta => {
                    if (!meta?.thumbnail) {
                        generateThumbnail(cachedBlob).then(res => {
                            if (res) saveMetadata(url, {
                                thumbnail: res.blob,
                                width: res.width,
                                height: res.height,
                                originalWidth: res.originalWidth,
                                originalHeight: res.originalHeight,
                                size: cachedBlob.size
                            });
                        });
                    }
                });
            } else if (url.match(/\.(mp4|webm|mov)$/i) || cachedBlob.type.startsWith(MIME_PREFIX_VIDEO)) {
                getMetadata(url).then(meta => {
                    if (!meta?.thumbnail || !meta?.duration) {
                        generateVideoThumbnail(cachedBlob).then(res => {
                            if (res) saveMetadata(url, {
                                thumbnail: res.blob,
                                width: res.width,
                                height: res.height,
                                originalWidth: res.originalWidth,
                                originalHeight: res.originalHeight,
                                duration: res.duration,
                                size: cachedBlob.size
                            });
                        });
                    }
                });
            }
            return cachedBlob;
        }
    } catch (e) {
        console.warn('[Attachment] IDB Read Failed:', e);
    }

    // 2. Fetch from Network via Axios (Wrapper for Auth/Interceptors) + Fetch Adapter (Streaming)
    return limit(async () => {


        const setDownloadProgress = useAttachmentProgressStore.getState().setDownloadProgress;
        const clearProgress = useAttachmentProgressStore.getState().clearProgress;
        const tempKey = `temp_${url}`;

        try {
            // Check for partial download
            const existingBlob = await get(tempKey);
            const existingBytes = existingBlob instanceof Blob ? existingBlob.size : 0;

            const config = {
                adapter: createFetchAdapter(),
                headers: {},
                signal,
                validateStatus: (status) => status < 400 || status === 416 // Allow 416 to catch it manually
            };

            if (existingBytes > 0) {
                config.headers['Range'] = `bytes=${existingBytes}-`;
            }



            const response = await api.get(url, config);

            // Handle Range Not Satisfiable (416)
            if (response.status === 416) {
                await set(tempKey, null);
                throw new Error('Range Not Satisfiable - Retrying from start');
            }

            // Normal error handling for other statuses
            if (response.status >= 400) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Note: Axios headers keys are lowercased
            const contentLength = response.headers['content-length'];
            const contentRange = response.headers['content-range'];
            const total = parseInt(contentLength, 10);
            const isPartial = response.status === 206;

            let activeExistingBytes = existingBytes;
            let activeExistingBlob = existingBlob;

            if (!isPartial && existingBytes > 0) {
                activeExistingBytes = 0;
                activeExistingBlob = null;
                // Clear the partial IDB temp key immediately
                await set(tempKey, null);
            }

            let fullSize = total;
            if (contentRange) {
                const match = contentRange.match(/\/(\d+)$/);
                if (match) fullSize = parseInt(match[1], 10);
            } else if (isPartial) {
                fullSize = activeExistingBytes + total;
            }

            // response.data is the stream from our adapter
            const reader = response.data.getReader();
            const chunks = [];
            let receivedLength = 0;



            // Helper to save partial progress
            const saveProgress = async (currentChunks) => {
                if (currentChunks.length > 0) {
                    try {
                        console.log('[Attachment] Saving partial progress...');
                        const newParts = isPartial && activeExistingBlob ? [activeExistingBlob, ...currentChunks] : currentChunks;
                        const partialType = response.headers['content-type'] || 'application/octet-stream';
                        const partialBlob = new Blob(newParts, { type: partialType });
                        await set(tempKey, partialBlob);
                        console.log('[Attachment] Partial progress saved.');
                    } catch (e) {
                        console.error('[Attachment] Failed to save partial progress:', e);
                    }
                }
            };

            while (true) {
                try {
                    const { done, value } = await reader.read();
                    if (done) break;



                    chunks.push(value);
                    receivedLength += value.length;

                    const currentTotal = activeExistingBytes + receivedLength;
                    const percent = fullSize ? Math.round((currentTotal * 100) / fullSize) : 0;

                    setDownloadProgress(url, percent);
                } catch (readError) {
                    // Save on Abort/Error if we have data
                    await saveProgress(chunks);

                    if (readError.name === 'AbortError' || signal.aborted || readError.message === 'Aborted') {
                        console.log('[Attachment] Download Paused/Aborted (caught error)');
                        throw readError; // CRITICAL FIX: throw to prevent treating this partial as the final blob
                    } else {
                        throw readError;
                    }
                }
            }

            const newParts = isPartial && activeExistingBlob ? [activeExistingBlob, ...chunks] : chunks;
            const finalType = response.headers['content-type'] || 'application/octet-stream';
            const finalBlob = new Blob(newParts, { type: finalType });

            const fileName = url.split('/').pop() || 'downloaded-file';
            const file = new File([finalBlob], fileName, {
                type: finalBlob.type,
                lastModified: Date.now()
            });

            const savePromise = set(url, file).then(() => {
                trackAccess(url);
                evictIfNeeded().catch(() => { });
                // Cleanup temp
                set(tempKey, null).catch(() => { });
            });

            // 2. Generate Thumbnails (Optimistic)
            if (file.type.startsWith(MIME_PREFIX_IMAGE)) {
                generateThumbnail(file)
                    .then(result => {
                        if (result) {
                            saveMetadata(url, {
                                thumbnail: result.blob,
                                width: result.width,
                                height: result.height,
                                originalWidth: result.originalWidth,
                                originalHeight: result.originalHeight,
                                size: file.size
                            });
                        }
                    })
                    .catch(e => console.warn('[Attachment] Thumbnail Gen Failed:', e));
            } else if (file.type.startsWith(MIME_PREFIX_VIDEO)) {
                // Generate Thumbnail for VIDEOS
                generateVideoThumbnail(file)
                    .then(result => {
                        if (result) {
                            saveMetadata(url, {
                                thumbnail: result.blob,
                                width: result.width,
                                height: result.height,
                                originalWidth: result.originalWidth,
                                originalHeight: result.originalHeight,
                                duration: result.duration,
                                size: file.size
                            });
                        }
                    })
                    .catch(e => console.warn('[Attachment] Video Thumbnail Gen Failed:', e));
            }

            await savePromise;
            clearProgress(url);
            return file;

        } catch (error) {
            // If it was an abort, we ALREADY handled the save above (inside the loop catch or signal check)
            // But if it was a network error, we might want to save progress too?
            // Ideally yes.

            // Re-throw unless it's strictly an abort we want to silence?
            // React Query handles AbortError by resetting state usually.
            if (error.name !== 'AbortError' && error.message !== 'Aborted') {
                console.error('[Attachment] Download Failed:', error);
            }

            // Ensure progress is cleared on error? 
            // Maybe NOT, so UI shows "Error at 50%"?
            // The store logic usually requires manual clear.
            // Let's clear for now to avoid stuck bars.
            // clearProgress(url); 

            throw error;
        }
    });
};

/**
 * Hook to manage attachment lifecycle
 * @param {string} url - The URL of the attachment
 * @param {object} options - Additional options (enabled, etc.)
 * @returns {useQuery Result} - contains .data (Blob), .isLoading, .isError, .refetch
 */
export const useAttachment = (url, options = {}) => {
    return useQuery({
        queryKey: ['attachment', url],
        queryFn: fetchAndCacheAttachment,
        enabled: !!url,
        ...options, // Allow overriding enabled, etc.
        staleTime: Infinity, // Blobs are immutable by URL
        gcTime: 1000 * 60 * 5, // Keep in RAM for 5 mins, then rely on IDB
        retry: 2,
        refetchOnWindowFocus: false,
        refetchOnMount: false, // If we have it in RAM/Stale, don't recheck
    });
};

/**
 * Prefetch an attachment URL into the cache
 * Use this to eagerly load adjacent attachments
 * 
 * @param {object} queryClient
 * @param {string} url 
 */
export const prefetchAttachment = async (queryClient, url) => {
    if (!url || typeof url !== 'string') return;

    // 1. Prefetch Blob (Network/IDB -> Memory)
    // This now implicitly handles thumbnail generation if needed
    await queryClient.prefetchQuery({
        queryKey: ['attachment', url],
        queryFn: fetchAndCacheAttachment,
        staleTime: Infinity,
    });
};

