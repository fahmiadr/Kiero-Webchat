import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { getMetadata, saveMetadata } from '@/services/attachmentCache';
import { generateThumbnail, generateVideoThumbnail } from '@/utils/generateThumbnail';
import api from '@/lib/axios';

/**
 * Unified hook for attachment metadata (duration, size, thumbnail, playbackPosition, etc.)
 * 
 * Centralizes metadata fetching logic that was duplicated across components.
 * Uses TanStack Query for caching and deduplication.
 * 
 * @param {string} url - The attachment URL (key)
 * @param {object} [options] - Options
 * @param {string} [options.type] - Hint for file type (e.g. 'video', 'image')
 * @param {object} [options.initialData] - Initial metadata from props/socket to avoid fetch
 * @returns {{ metadata: object, isLoading: boolean, isError: boolean, error: any, refetch: function, updateMetadata: function }}
 */
export const useAttachmentMetadata = (url, options = {}) => {
    const queryClient = useQueryClient();
    // Remove default {} for initialData to handle loading state correctly
    const { type: typeHint, enabled = true, initialData } = options;

    // Determine freshness (skip fetch if sufficient data provided via props/socket)
    const isFresh = useMemo(() => {
        if (!initialData || Object.keys(initialData).length === 0) return false;

        // Video needs thumbnail + duration (Size is bonus)
        if (typeHint === 'video' || (url && url.match(/\.(mp4|webm|ogv|mov)$/i))) {
            return !!(initialData.thumbnail && initialData.duration);
        }

        // Audio needs duration
        if (typeHint === 'audio' || (url && url.match(/\.(mp3|wav|ogg|aac|m4a)$/i))) {
            return !!(initialData.duration);
        }

        // Image: if we have dimensions/size, we can skip HEAD
        if (typeHint === 'image' || (url && url.match(/\.(jpg|jpeg|png|webp|gif)$/i))) {
            return !!(initialData.width && initialData.height);
        }

        // Generic file/document (size is sufficient)
        if (typeHint === 'file') {
            return !!(initialData.size && initialData.size > 0);
        }

        return false;
    }, [initialData, typeHint, url]);

    const {
        data: metadata,
        isLoading,
        isError,
        error,
        isFetching,
        refetch
    } = useQuery({
        queryKey: ['attachment-meta', url],
        // Retry logic: 2 times with exponential backoff
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        // Use props data as initial cache
        initialData: initialData,
        // If provided data is sufficient (fresh), don't refetch. Otherwise, fetch immediately (0).
        staleTime: isFresh ? Infinity : 0,
        queryFn: async () => {
            if (!url) return {};

            // 1. Check IDB Cache first
            const cachedMeta = await getMetadata(url);

            // Gap Filling Check:
            // If we expect video (hint or url) but lack thumbnail, verify cache.
            // RELAXED: Don't force refetch if just duration is missing. Thumbnail is the expensive part.
            // If we have a thumbnail, we avoid triggering the heavy 'generateVideoThumbnail' (download).
            const isVideoHint = (typeHint === 'video') || url.match(/\.(mp4|webm|ogv|ogg|mov)$/i);
            const isIncomplete = isVideoHint && (!cachedMeta || !cachedMeta.thumbnail);

            if (cachedMeta && !isIncomplete) return cachedMeta;

            // 2. Fallback: Fetch Metadata from Server
            if (!url.startsWith('blob:')) {
                let meta = cachedMeta || {};

                // Determine generation needs
                // Include ogv in regex
                const isVideo = (typeHint === 'video') ||
                    (url && url.match(/\.(mp4|webm|ogv|ogg|mov)$/i));

                // Only generate if we are strictly missing the thumbnail.
                // Duration is nice to have, but not worth re-downloading the whole video for.
                const needsGeneration = isVideo && !meta.thumbnail;
                const isImage = !isVideo && ((typeHint === 'image') || (url && url.match(/\.(jpg|jpeg|png|webp|gif)$/i)));

                // Execute fetches in parallel
                const promises = [];

                // 1. Optimized Video Flow (Single Request)
                // If we need to generate a thumbnail, we can get the size and the data in one go via Range Request.
                if (needsGeneration) {
                    promises.push(
                        (async () => {
                            try {
                                // Attempt 1: Range Request (1MB)
                                // This gives us Size + Partial Blob for Thumbnail + Duration
                                const rangeResponse = await api.get(url, {
                                    headers: { Range: 'bytes=0-1048576' }, // 1MB
                                    responseType: 'blob'
                                });

                                const result = {};

                                // Extract Size from Content-Range: bytes 0-1048576/12345678
                                const contentRange = rangeResponse.headers['content-range'];
                                if (contentRange) {
                                    const match = contentRange.match(/\/(\d+)$/);
                                    if (match) result.size = parseInt(match[1], 10);
                                }

                                // Fallback size from content-length if range missing (unlikely for 206)
                                if (!result.size && rangeResponse.headers['content-length']) {
                                    // Note: content-length of partial is just the chunk size, not total.
                                    // So strictly rely on Content-Range for total size if possible.
                                }

                                // Attempt Generation with Partial Blob
                                const partialBlob = rangeResponse.data;
                                const genResult = await generateVideoThumbnail(partialBlob);

                                if (genResult) {
                                    return { type: 'gen', data: { ...genResult, ...result, thumbnail: genResult.blob } };
                                }

                                // Attempt 2: Fallback to Full URL if partial failed
                                // (e.g. moov atom at end of file)
                                console.warn('[Metadata] Partial generation failed, falling back to full URL');
                                const fallbackResult = await generateVideoThumbnail(url);
                                if (fallbackResult) {
                                    return { type: 'gen', data: { ...fallbackResult, ...result, thumbnail: fallbackResult.blob } };
                                }

                                throw new Error('Video generation failed');

                            } catch (e) {
                                console.warn('[Metadata] Optimized video fetch failed:', e);
                                // Final Fallback: Just return error. 
                                // We explicitly DO NOT want to download the full file here as it causes massive network usage.
                                return { type: 'gen', error: e };
                            }
                        })()
                    );
                }
                // 2. Standard HEAD Request (Size & Headers)
                // Only run if we are NOT doing the optimized video flow (i.e. not generating video)
                // OPTIMIZATION: Skip for images as we don't need size/type immediately (GET will provide it)
                else if (!isImage) {
                    promises.push(
                        api.head(url).then(response => {
                            const h = response.headers;
                            const result = {};

                            const size = parseInt(h['content-length'], 10);
                            if (!isNaN(size)) result.size = size;

                            // Some backends might expose these
                            const durationHeader = h['x-duration'] || h['content-duration'] || h['duration'];
                            if (durationHeader) result.duration = parseFloat(durationHeader);

                            const contentType = h['content-type'];
                            if (contentType) result.contentType = contentType;

                            return { type: 'head', data: result };
                        }).catch(e => {
                            console.warn('[Metadata] HEAD fetch failed:', e);
                            return { type: 'head', error: e };
                        })
                    );
                }
                // 2. Optimized Audio Flow (Single Request for Duration)
                // Similar to video, we fetch a chunk to get duration without full download.
                else if (options.type === 'audio' || url.match(/\.(mp3|wav|aac|m4a|weba|ogg)$/i)) {
                    if (!meta.duration) {
                        promises.push(
                            (async () => {
                                try {
                                    const { getAudioDuration } = await import('@/utils/generateThumbnail');

                                    // Robust Parallel Request:
                                    // 1. Size: Minimal Range request (bytes=0-0)
                                    // 2. Duration: Browser Native Audio (very efficient)
                                    const [rangeResponse, duration] = await Promise.all([
                                        api.get(url, {
                                            headers: { Range: 'bytes=0-0' },
                                            responseType: 'blob'
                                        }).catch(e => null),
                                        getAudioDuration(url)
                                    ]);

                                    const result = {};

                                    // 1. Extract Size
                                    if (rangeResponse) {
                                        const contentRange = rangeResponse.headers['content-range'];
                                        if (contentRange) {
                                            const match = contentRange.match(/\/(\d+)$/);
                                            if (match) result.size = parseInt(match[1], 10);
                                        }
                                    }

                                    // 2. Duration
                                    if (duration) {
                                        result.duration = duration;
                                    }

                                    // Only return if we found something
                                    if (result.size || result.duration) {
                                        return { type: 'gen', data: result };
                                    }
                                    return { type: 'gen', data: {} };

                                } catch (e) {
                                    console.warn('[Metadata] Robust audio fetch failed:', e);
                                    return { type: 'gen', error: e };
                                }
                            })()
                        );
                    }
                } else if (isImage) {
                    // Start image generation in parallel if needed (though usually we wait for blob for images)
                    // For remote images, we can try generating from URL if browser cache is hot
                    // But usually we skip this for images to avoid double download
                }

                // Wait for all
                const results = await Promise.all(promises);

                // Merge results
                results.forEach(res => {
                    if (res && res.type === 'head' && res.data) {
                        meta = { ...meta, ...res.data };
                    }
                    if (res && res.type === 'gen' && res.data) {
                        meta = { ...meta, ...res.data };
                    }
                });

                // CRITICAL: If video generation failed completely and we have no fallback, throw to trigger retry
                // But only if we asked for it
                const genResult = results.find(r => r && r.type === 'gen');
                if (needsGeneration && genResult?.error) {
                    throw genResult.error;
                }

                if (Object.keys(meta).length > 0) {
                    // Success! Save and return
                    await saveMetadata(url, meta);
                    return meta;
                }
            }

            // If we have cachedMeta, return it even if incomplete
            if (cachedMeta) return cachedMeta;

            return {};
        },
        enabled: !!url && enabled,
        staleTime: Infinity,
        gcTime: 1000 * 60 * 30,
        refetchOnWindowFocus: false,
    });

    /**
     * Update metadata and sync to both Query Cache and IDB
     */
    const updateMetadata = useCallback(async (updates) => {
        const current = queryClient.getQueryData(['attachment-meta', url]) || {};
        const merged = { ...current, ...updates };
        await saveMetadata(url, merged);
        queryClient.setQueryData(['attachment-meta', url], merged);
    }, [url, queryClient]);

    // Merge cached data with initial props to ensure robustness
    const finalMetadata = useMemo(() => ({
        ...(initialData || {}),
        ...(metadata || {})
    }), [initialData, metadata]);

    return {
        metadata: finalMetadata,
        isLoading, // Initial load
        isFetching, // Background refetch/retry
        isError,
        error,
        refetch,
        updateMetadata
    };
};
