import { Download, Play } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAttachment } from '@/hooks/useAttachment';
import { useAttachmentMetadata } from '@/hooks/useAttachmentMetadata';
import { useInView } from '@/hooks/useInView';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import useAttachmentProgressStore from '@/stores/useAttachmentProgressStore';
import { cn } from '@/utils/cn';
import { formatBytes, formatDuration } from '@/utils/formatUtils';
import { calculateLayoutConfig } from '@/utils/mediaLayoutUtils';
import { AttachmentError } from './AttachmentError';
import { AttachmentLoader } from './AttachmentLoader';
import DownloadStatusControls from './DownloadStatusControls';

/**
 * VideoThumbnail Component
 *
 * WhatsApp-style video preview with shared cache support.
 */
const VideoThumbnail = memo(function VideoThumbnail({
  src,
  fileName = 'Video',
  onPlay,
  className = '',
  thumbnailUrl = null, // Pre-generated thumbnail from preview (String URL)
  thumbnailBlob = null, // Raw Blob (from Preview Dialog for Optimistic UI)
  meta = null, // Metadata { width, height } for instant layout
  backendUrl = '', // Backend URL for download proxy
  clientId = '',
  onResize,
  isMediaOnly = false, // Whether this is a media-only message (no text)
}) {
  const [fileSize, setFileSize] = useState(() => meta?.size || null);
  const [duration, setDuration] = useState(() => meta?.duration || null);
  const [localMeta, setLocalMeta] = useState(null);

  // PERFORMANCE: Lazy initialization - only load heavy resources when visible
  const { ref, isInView } = useInView({ triggerOnce: true, rootMargin: '400px' });

  // Call Metadata Hook
  const {
    metadata,
    isFetching: isMetaFetching,
    isError: isMetaError,
    refetch: refetchMetadata,
  } = useAttachmentMetadata(src, {
    type: 'video',
    enabled: Boolean(src) && isInView && Boolean(backendUrl),
    backendUrl,
    clientId,
  });
  const [isEnabled, setIsEnabled] = useState(false); // Controls download trigger
  // New State to prevent flicker: start as 'restoring' until we check IDB
  const [isRestoring, setIsRestoring] = useState(true);

  const cachedThumbnailBlob = metadata?.thumbnail instanceof Blob ? metadata.thumbnail : null;

  // Use Registry for Thumbnail Blob (Internal or Local Prop)
  const internalThumbnailUrl = useObjectUrl(cachedThumbnailBlob);
  const localThumbnailUrl = useObjectUrl(thumbnailBlob);

  // Derived Thumbnail URL
  const thumbnail = useMemo(() => {
    if (localThumbnailUrl) return localThumbnailUrl; // Optimistic local blob URL (High Priority)
    if (internalThumbnailUrl) return internalThumbnailUrl; // Registry URL for cached blob
    if (thumbnailUrl) return thumbnailUrl; // External prop string (e.g. from DB)
    if (typeof metadata?.thumbnail === 'string') return metadata.thumbnail; // Cached String URL
    return null;
  }, [thumbnailUrl, localThumbnailUrl, internalThumbnailUrl, metadata?.thumbnail]);

  // Derived Error State
  const generationError = isMetaError && !thumbnail;

  // PERFORMANCE: Lazy initialization - moved up to avoid ReferenceError

  // WhatsApp-style layout calculation moved down to access 'metadata'

  // Determine if this is an optimistic upload (local blob) vs remote video
  const isOptimistic = useMemo(() => {
    return src?.startsWith('blob:') || src?.startsWith('data:') || Boolean(thumbnailBlob);
  }, [src, thumbnailBlob]);

  // TanStack Query for Video Blob
  const {
    data: videoBlob,
    isLoading: isDownloading,
    isError: isDownloadError,
    cancel,
  } = useAttachment(src, {
    enabled: isEnabled && !isOptimistic && Boolean(src) && Boolean(backendUrl),
    backendUrl,
    clientId,
  });

  // Capture progress for pause state
  const currentDownloadProgress = useAttachmentProgressStore((s) => s.downloadProgress[src] || 0);

  // Create Blob URL for video playback if downloaded using Registry
  const blobUrl = useObjectUrl(videoBlob);

  // Individual action selectors
  const handleDownload = useCallback((e) => {
    if (e) e.stopPropagation();
    setIsEnabled(true);
  }, []);

  const handleCancel = useCallback(
    async (e) => {
      if (e) e.stopPropagation();
      setIsEnabled(false);
      // Explicitly cancel the query to trigger the abort signal
      cancel();
    },
    [cancel],
  );

  // PERFORMANCE: Check IDB for existence on mount to sync UI state
  // REMOVED IDB CHECK AS REQUESTED
  useEffect(() => {
    // If we already have videoBlob from ReactQuery or URL, no need to restore
    if (videoBlob) {
      setIsRestoring(false);
      return;
    }

    setIsRestoring(false);
  }, [src, videoBlob]);

  // Metadata Hook with Standard TanStack Query Retry Logic
  // Only run when in view to prevent massive network spam on mount

  // Manual Generation Effect Removed (Handled by Hook)

  // WhatsApp-style layout calculation
  const { containerStyle, objectFit } = useMemo(() => {
    return calculateLayoutConfig({ ...meta, ...localMeta }, 'cover', 'video');
  }, [meta, localMeta]);

  const reportedWidthRef = useRef(null);

  useEffect(() => {
    if (containerStyle?.width && onResize) {
      const numericWidth = parseInt(containerStyle.width, 10);
      if (!Number.isNaN(numericWidth) && reportedWidthRef.current !== numericWidth) {
        onResize(numericWidth);
        reportedWidthRef.current = numericWidth;
      }
    }
  }, [containerStyle?.width, onResize]);

  // Notify parent of width change
  const handleRef = useCallback(
    (node) => {
      ref.current = node; // Also set the inView ref
    },
    [ref],
  );

  // Use props directly for size/duration.
  // If meta prop updates (e.g. from optimistic -> confirmed), ensure state syncs.
  useEffect(() => {
    if (meta?.size) setFileSize(meta.size);
    if (meta?.duration) setDuration(meta.duration);
  }, [meta]);

  // Status Logic
  let status = 'idle';
  if (isDownloading && isEnabled) status = 'downloading';
  else if (isDownloadError) status = 'error';
  else if (videoBlob && !isDownloading)
    status = 'downloaded'; // Ready
  else if (!isEnabled && currentDownloadProgress > 0 && !videoBlob) status = 'paused';

  const handleRetryGeneration = useCallback(
    (e) => {
      if (e) e.stopPropagation();
      refetchMetadata();
    },
    [refetchMetadata],
  );

  // Handle click on the thumbnail area
  const handleAreaClick = useCallback(
    (e) => {
      if (e) e.stopPropagation();

      // Block action if error, fetching metadata, or no thumbnail (not ready)
      // Unless it's a local file upload which might not have a thumbnail yet but has a blob
      // Block action if no thumbnail (not ready)
      // Unless it's a local file upload which might not have a thumbnail yet but has a blob
      if (!thumbnail) return;

      if (onPlay) {
        if (status === 'downloaded' && blobUrl) {
          // Pass NULL for blob, so MessageBubble uses the provided URL
          // We use blobUrl which is managed by this component (useObjectUrl)
          onPlay(null, blobUrl);
        } else {
          // Optimistic check: if it's optimistic, play src directly
          const isLocal = src && (src.startsWith('blob:') || src.startsWith('data:'));
          if (isLocal) {
            onPlay(null, src);
          } else {
            setIsEnabled(true);
            onPlay(null, src);
          }
        }
      }
    },
    [thumbnail, status, blobUrl, onPlay, src],
  );

  const isReady = !isDownloadError && thumbnail;

  const displayProgress = currentDownloadProgress;

  return (
    <Button
      ref={handleRef}
      variant="ghost"
      type="button"
      style={{
        ...containerStyle,
        maxWidth: '100%',
        height: 'auto',
      }}
      className={cn(
        'group !p-0 relative h-auto overflow-hidden rounded-xl font-normal text-base hover:bg-transparent',
        isReady ? 'cursor-pointer' : 'cursor-default',
        'bg-transparent',
        className,
      )}
      onClick={handleAreaClick}
    >
      {/* Thumbnail Image */}
      {thumbnail ? (
        <img
          src={thumbnail}
          alt={fileName}
          style={{ objectFit }}
          loading="lazy"
          decoding="async"
          className="block h-full w-full transition-transform group-hover:scale-105"
          onLoad={(e) => {
            if (!meta?.width && !localMeta?.width && e.target.naturalWidth) {
              setLocalMeta({
                width: e.target.naturalWidth,
                height: e.target.naturalHeight,
              });
            }
          }}
        />
      ) : (
        isMetaFetching && <AttachmentLoader />
      )}

      {/* Hover overlay */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-colors group-hover:bg-black/10 group-hover:opacity-100" />

      {/* ERROR OVERLAY: Generation Failed */}
      {generationError && !thumbnail && <AttachmentError onRetry={handleRetryGeneration} />}

      {/* Center Play Button Overlay (Require thumbnail) */}
      {thumbnail && !generationError && !isRestoring && !isDownloadError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/30">
          <div
            className={`rounded-full p-4 backdrop-blur-sm transition-transform group-hover:scale-110 ${blobUrl || isOptimistic ? 'bg-white/20' : 'bg-black/40'}`}
          >
            <Play className="h-8 w-8 fill-white text-white" />
          </div>
        </div>
      )}

      {/* Top-right Status Area (Download & Progress) */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
        {/* Upload indicators removed as they are handled by MessageBubble */}

        {/* Idle: Capsule download button (Require thumbnail to show size/button) */}
        {status === 'idle' &&
          !blobUrl &&
          thumbnail &&
          !generationError &&
          !isRestoring &&
          !isOptimistic && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={handleDownload}
                  className="flex h-auto items-center gap-1 rounded-full border-0 bg-white/20 px-2.5 py-1 text-white text-xs backdrop-blur-sm hover:bg-white/30"
                >
                  <Download className="h-3.5 w-3.5" />
                  {fileSize && <span>{formatBytes(fileSize)}</span>}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Unduh video</TooltipContent>
            </Tooltip>
          )}

        {/* Download status controls (downloading/paused/error) */}
        <DownloadStatusControls
          status={status}
          progress={displayProgress}
          onCancel={handleCancel}
          onResume={handleDownload}
          onRetry={handleDownload}
          size="sm"
          showPercentage
          reverseLayout
          variant="overlay"
        />
      </div>

      {/* Bottom-left Duration Badge (Require thumbnail) */}
      {typeof duration === 'number' && thumbnail && !generationError && (
        <Badge
          variant="secondary"
          className="absolute bottom-2 left-2 z-10 rounded border-0 bg-black/60 px-1.5 py-0.5 font-normal text-[10px] text-white leading-tight backdrop-blur-sm hover:bg-black/60"
        >
          {formatDuration(duration)}
        </Badge>
      )}

      {/* Bottom gradient (media-only) */}
      {isMediaOnly && (
        <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-10 bg-gradient-to-t from-black/60 to-transparent" />
      )}
    </Button>
  );
});

export default VideoThumbnail;
