/**
 * useAttachment Hook
 *
 * Fetches attachment files from widget-backend with progress tracking.
 * Uses TanStack Query for caching and deduplication.
 *
 * NOTE: URL rewriting is handled by widget-backend (urlUtils.js)
 * before messages reach the frontend. No transformation needed here.
 */

import useAttachmentProgressStore from '@stores/useAttachmentProgressStore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Fetch attachment with progress tracking
 *
 * @param {string} url - Full URL to fetch (already transformed by backend)
 * @param {string} backendUrl - Base backend URL
 * @param {Function} setProgress - Progress callback
 * @returns {Promise<Blob>}
 */
const fetchAttachmentWithProgress = async (
  url,
  backendUrl,
  clientId,
  setProgress,
  signal,
  onChunk,
  disableResume = false,
) => {
  // URL is already in correct format from backend (e.g., /api/media/proxy/type/file)
  const fullUrl = url.startsWith('http') ? url : `${backendUrl}${url}`;

  // Clear previous progress if resume is disabled
  if (disableResume) {
    useAttachmentProgressStore.getState().clearProgress(url);
  }

  // Get existing chunks to resume
  const existingSize = disableResume ? 0 : useAttachmentProgressStore.getState().getChunkSize(url);
  const headers = {
    'X-Client-Id': clientId || ''
  };
  if (existingSize > 0) {
    headers.Range = `bytes=${existingSize}-`;
  }

  const response = await fetch(fullUrl, { signal, headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status}`);
  }

  // Handle 206 Partial Content vs 200 OK (Restart)
  const isPartial = response.status === 206;
  if (!isPartial && existingSize > 0) {
    // Server didn't accept range, clear existing progress
    useAttachmentProgressStore.getState().clearProgress(url);
  }

  // Check if we can track progress
  const contentLength = response.headers.get('Content-Length');
  // Content-Range format: bytes START-END/TOTAL
  const contentRange = response.headers.get('Content-Range');

  let total = 0;
  if (contentRange) {
    const parts = contentRange.split('/');
    total = parseInt(parts[1], 10);
  } else if (contentLength) {
    total = parseInt(contentLength, 10) + (isPartial ? existingSize : 0);
  }

  if ((!total && !contentLength) || !response.body) {
    // No total size known or no body, just get blob (fallback)
    const blob = await response.blob();
    if (onChunk) {
      // Convert blob to chunk for consistency if needed, but usually we just return
      // For now, if no progress possible, just return blob
    }
    return blob;
  }

  let loaded = isPartial ? existingSize : 0;
  const reader = response.body.getReader();
  // Use existing chunks if partial, otherwise empty
  // We don't keep them in memory here to avoid duplication, we rely on Store

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    // value is a Uint8Array chunk
    if (onChunk) {
      onChunk(value);
    }

    loaded += value.length;

    if (total > 0) {
      const progress = Math.round((loaded / total) * 100);
      setProgress(progress);
    }
  }

  // Re-assemble full blob from Store
  const allChunks = useAttachmentProgressStore.getState().getCombinedChunks(url);
  const blob = new Blob(allChunks, {
    type: response.headers.get('Content-Type') || 'application/octet-stream',
  });

  return blob;
};

/**
 * useAttachment Hook
 *
 * @param {string} url - Attachment URL (already transformed by backend)
 * @param {Object} options - Hook options
 * @param {boolean} options.enabled - Whether to fetch
 * @param {string} options.backendUrl - Backend base URL
 * @param {boolean} options.disableResume - Whether to disable resume/range requests (e.g. for images)
 * @returns {Object} - { data: Blob | null, isLoading, isError, refetch }
 */
export const useAttachment = (url, options = {}) => {
  const queryClient = useQueryClient();
  const { enabled = false, backendUrl = '', clientId = '', disableResume = false } = options;
  const setDownloadProgress = useAttachmentProgressStore((s) => s.setDownloadProgress);
  const addChunk = useAttachmentProgressStore((s) => s.addChunk);
  // const clearProgress = useAttachmentProgressStore(s => s.clearProgress); // Don't auto-clear
  const mountedRef = useRef(true);

  // Skip fetching for local blob URLs
  const isLocalBlob = url?.startsWith('blob:') || url?.startsWith('data:');
  const shouldFetch = enabled && Boolean(url) && !isLocalBlob && Boolean(backendUrl);

  const queryResult = useQuery({
    queryKey: ['attachment', url],
    queryFn: async ({ signal }) => {
      if (!url) throw new Error('No URL provided');

      return await fetchAttachmentWithProgress(
        url,
        backendUrl,
        clientId,
        (progress) => {
          if (mountedRef.current) {
            setDownloadProgress(url, progress);
          }
        },
        signal,
        (chunk) => {
          if (mountedRef.current) {
            addChunk(url, chunk);
          }
        },
        disableResume,
      );
    },
    enabled: shouldFetch,
    staleTime: Infinity, // Attachments don't change
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const cancel = useCallback(() => {
    queryClient.cancelQueries({ queryKey: ['attachment', url] });
  }, [queryClient, url]);

  return {
    data: queryResult.data || null,
    isLoading: queryResult.isLoading,
    isError: queryResult.isError,
    refetch: queryResult.refetch,
    cancel,
  };
};
