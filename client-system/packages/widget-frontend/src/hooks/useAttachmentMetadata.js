import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { generateVideoThumbnail } from '@/utils/generateThumbnail';

/**
 * Unified hook for attachment metadata (duration, size, thumbnail)
 *
 * Centralizes metadata fetching logic.
 * Uses TanStack Query for caching and deduplication.
 *
 * @param {string} url - The attachment URL (key)
 * @param {object} [options] - Options
 * @param {string} [options.type] - Hint for file type (e.g. 'video', 'image')
 * @returns {{ metadata: object, isLoading: boolean, isError: boolean, error: any, refetch: function, updateMetadata: function }}
 */
export const useAttachmentMetadata = (url, options = {}) => {
  const queryClient = useQueryClient();
  const { type: typeHint, enabled = true, backendUrl = '', clientId = '', initialMetadata = {} } = options;

  const {
    data: metadata,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['attachment-meta', url],
    // Retry logic: 2 times with exponential backoff
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    queryFn: async () => {
      if (!url) return {};

      // Initial Check: If we have full metadata passed in, just use it + any existing cache
      const metaFromProps = { ...initialMetadata };

      // 0. Resolve Full URL
      // If url is relative (from history), prepend backendUrl
      const fullUrl =
        url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')
          ? url
          : `${backendUrl}${url}`;

      // 1. Generation Logic (No IDB Check)
      if (!url.startsWith('blob:')) {
        // Determine generation needs
        const isVideo = typeHint === 'video' || url?.match(/\.(mp4|webm|ogg|mov)$/i);

        // Only generate if we are strictly missing the thumbnail.
        const needsGeneration = isVideo; // Simplified for now: if video, try generate
        const isImage =
          !isVideo && (typeHint === 'image' || url?.match(/\.(jpg|jpeg|png|webp|gif)$/i));

        // Execute fetches in parallel
        const promises = [];

        // 1. Video Flow (Range Request)
        if (needsGeneration) {
          promises.push(
            (async () => {
              try {
                // Optimized: 1MB Range Request (matches Agent implementation)
                // This gives us Size + Partial Blob for Thumbnail + Duration
                const rangeResponse = await fetch(fullUrl, {
                  headers: {
                    Range: 'bytes=0-1048576',
                    'X-Client-Id': clientId || ''
                  },
                });

                if (!rangeResponse.ok && rangeResponse.status !== 206) {
                  // Fallback if Range not supported or fails
                  throw new Error(`Range request failed: ${rangeResponse.status}`);
                }

                const result = { ...metaFromProps }; // Start with prop metadata

                // Extract Size from Content-Range (Only if missing)
                if (!result.size) {
                  const contentRange = rangeResponse.headers.get('content-range');
                  if (contentRange) {
                    const match = contentRange.match(/\/(\d+)$/);
                    if (match) result.size = parseInt(match[1], 10);
                  }
                }

                // Do NOT use content-length for 206 responses as it's just the chunk size
                // If Content-Range is missing, we simply don't have the size from this request

                // vital: Set explicit MIME type for the partial blob
                // If missing, browser might treat as application/octet-stream and fail to play/thumbnail
                const contentType = rangeResponse.headers.get('Content-Type') || 'video/mp4';
                const rawBlob = await rangeResponse.blob();
                const partialBlob = new Blob([rawBlob], { type: contentType });

                // Generate Thumbnail
                const genResult = await generateVideoThumbnail(partialBlob);

                if (genResult) {
                  return {
                    type: 'gen',
                    data: { ...genResult, ...result, thumbnail: genResult.blob },
                  };
                }
                const fallbackResult = await generateVideoThumbnail(fullUrl);
                if (fallbackResult) {
                  return {
                    type: 'gen',
                    data: { ...fallbackResult, ...result, thumbnail: fallbackResult.blob },
                  };
                }

                throw new Error('Video generation failed');
              } catch (e) {
                return { type: 'gen', error: e };
              }
            })(),
          );
        }
        // 2. Standard HEAD Request (Size/Type for others)
        else if (!isImage) {
          promises.push(
            fetch(fullUrl, { method: 'HEAD', headers: { 'X-Client-Id': clientId || '' } })
              .then((response) => {
                const result = {};
                const len = response.headers.get('content-length');
                if (len) result.size = parseInt(len, 10);

                const type = response.headers.get('content-type');
                if (type) result.contentType = type;

                return { type: 'head', data: result };
              })
              .catch((e) => {
                return { type: 'head', error: e };
              }),
          );
        }

        // Wait for all
        const results = await Promise.all(promises);

        let meta = {};

        // Merge results
        results.forEach((res) => {
          if (res?.data) {
            meta = { ...meta, ...res.data };
          }
        });

        // Check for errors
        const genResult = results.find((r) => r && r.type === 'gen');
        if (needsGeneration && genResult?.error) {
          throw genResult.error;
        }

        if (Object.keys(meta).length > 0) {
          // Success! Return
          return meta;
        }
      }

      return {};
    },
    enabled: Boolean(url) && enabled,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });

  const updateMetadata = useCallback(
    (updates) => {
      const current = queryClient.getQueryData(['attachment-meta', url]) || {};
      const merged = { ...current, ...updates };
      queryClient.setQueryData(['attachment-meta', url], merged);
    },
    [url, queryClient],
  );

  return {
    metadata: metadata || {},
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    updateMetadata,
  };
};
