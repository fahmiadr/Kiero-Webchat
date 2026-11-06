/**
 * ImageAttachment Component
 *
 * Download-First Pattern:
 * 1. For incoming images (remote URL): Download via useAttachment → cache blob → display blob URL
 * 2. For optimistic uploads (local blob): Display directly without download
 * 3. Pass blob to ImageViewer for viewing without re-download
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAttachment } from '@/hooks/useAttachment';
import { useInView } from '@/hooks/useInView';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { cn } from '@/utils/cn';
import { generateThumbnail } from '@/utils/generateThumbnail';
import { calculateLayoutConfig } from '@/utils/mediaLayoutUtils';
import { AttachmentError } from './AttachmentError';
import { AttachmentLoader } from './AttachmentLoader';

const ImageAttachment = memo(function ImageAttachment({
  src,
  fileName,
  onClick,
  className = '',
  meta,
  backendUrl,
  clientId,
  thumbnailUrl, // External prop string (for optimistic upload)
  thumbnailBlob, // External prop blob (for optimistic upload)
  onResize, // Callback for parent dynamic sizing
  isMediaOnly = false, // Whether this is a media-only message (no text)
}) {
  const [imageError, setImageError] = useState(false);
  const [localMeta, setLocalMeta] = useState(null);
  const { ref, isInView } = useInView({ triggerOnce: true, rootMargin: '200px' });

  // Local generated thumbnail state
  const [generatedThumbnailBlob, setGeneratedThumbnailBlob] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Determine if this is an optimistic upload (local blob) vs remote image
  const isOptimistic = useMemo(() => {
    return src?.startsWith('blob:') || src?.startsWith('data:') || Boolean(thumbnailBlob);
  }, [src, thumbnailBlob]);

  // For remote images: use useAttachment to download full image
  const {
    data: downloadedBlob,
    isLoading: isDownloading,
    isError: downloadError,
    refetch,
  } = useAttachment(src, {
    enabled: isInView && !isOptimistic && Boolean(src) && Boolean(backendUrl) && !thumbnailUrl,
    backendUrl,
    clientId,
    disableResume: true,
  });

  // Use meta (from history) or localMeta (from onLoad) for layout
  // Merge them so we don't lose `size` if we use `localMeta` for dimensions
  const effectiveMeta = useMemo(() => {
    return { ...meta, ...localMeta };
  }, [meta, localMeta]);

  const { containerStyle, objectFit } = useMemo(() => {
    return calculateLayoutConfig(effectiveMeta, 'contain', 'image');
  }, [effectiveMeta]);

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

  // Manage blob URLs properly
  const managedThumbnailUrl = useObjectUrl(thumbnailBlob);
  const managedGeneratedUrl = useObjectUrl(generatedThumbnailBlob);

  // Effect: Generate thumbnail from downloaded full image
  useEffect(() => {
    if (!downloadedBlob || isOptimistic || generatedThumbnailBlob) return;

    let isActive = true;
    setIsGenerating(true);

    generateThumbnail(downloadedBlob)
      .then((result) => {
        if (isActive && result?.blob) {
          setGeneratedThumbnailBlob(result.blob);
        }
      })
      .catch((_err) => {
        // Fallback? Maybe just don't set generated, so displaySrc stays null or falls back?
      })
      .finally(() => {
        if (isActive) setIsGenerating(false);
      });

    return () => {
      isActive = false;
    };
  }, [downloadedBlob, isOptimistic, generatedThumbnailBlob]);

  // Determine final display source
  const displaySrc = useMemo(() => {
    // 1. Optimistic upload: use local blob/thumbnail
    if (isOptimistic) {
      if (managedThumbnailUrl) return managedThumbnailUrl;
      if (thumbnailUrl) return thumbnailUrl;
      if (src?.startsWith('blob:') || src?.startsWith('data:')) return src;
    }

    // 2. Client-Side Generated Thumbnail (from downloaded full image)
    // This is the PRIORITY for remote images as per requirement
    if (managedGeneratedUrl) return managedGeneratedUrl;

    // 3. Thumbnail URL (Server provided preview)
    if (thumbnailUrl) {
      return thumbnailUrl.startsWith('http') ? thumbnailUrl : `${backendUrl}${thumbnailUrl}`;
    }

    // 4. Fallback: If generation failed but we have full blob?
    // User requested "jangan tampilkan full image".
    // So we strictly wait for generation or usage of thumbnail.
    // If everything fails, maybe null (show loader/error).

    return null;
  }, [isOptimistic, managedThumbnailUrl, thumbnailUrl, src, managedGeneratedUrl, backendUrl]);

  // Status indicators
  const isError = imageError || downloadError;

  // Show loading if:
  // 1. Not optimistic (local is instant)
  // 2. Downloading OR Generating thumbnail
  // 3. Not in error state
  // This ensures loader shows even if we have a thumbnail, until full process is done.
  const showDownloadIndicator = !isOptimistic && (isDownloading || isGenerating) && !isError;

  const handleLoad = useCallback(
    (e) => {
      if (!meta?.width && !localMeta?.width && e.target.naturalWidth) {
        setLocalMeta({
          width: e.target.naturalWidth,
          height: e.target.naturalHeight,
        });
      }
    },
    [meta, localMeta],
  );

  const handleRetry = useCallback(() => {
    setImageError(false);
    if (downloadError) {
      refetch();
    }
  }, [downloadError, refetch]);

  // Handle click - pass blob data for ImageViewer
  const handleClick = useCallback(() => {
    if (imageError || downloadError || showDownloadIndicator) return;

    // For viewer: Pass the Full Downloaded Blob (High Quality)
    // because we only show thumbnail in bubble, but want full qual in viewer.

    let fullUrl = null;
    if (src) {
      if (src.startsWith('http') || src.startsWith('blob:')) {
        fullUrl = src;
      } else {
        fullUrl = `${backendUrl}${src}`;
      }
    }

    const viewerData = {
      blob: isOptimistic ? null : downloadedBlob || thumbnailBlob || null,
      fullUrl,
      src: fullUrl,
      fileName,
    };

    onClick?.(viewerData);
  }, [
    onClick,
    downloadedBlob,
    thumbnailBlob,
    src,
    backendUrl,
    fileName,
    imageError,
    downloadError,
    showDownloadIndicator,
    isOptimistic,
  ]);

  return (
    <Button
      ref={handleRef}
      variant="ghost"
      type="button"
      onClick={handleClick}
      style={{
        ...containerStyle,
        maxWidth: '100%',
        height: 'auto',
      }}
      className={cn(
        'group !p-0 relative block h-auto overflow-hidden rounded-xl bg-transparent font-normal text-base hover:bg-transparent',
        !isError && !showDownloadIndicator ? 'cursor-pointer' : 'cursor-default',
        className,
      )}
    >
      {/* Error UI */}
      {isError && (
        <div className="absolute inset-0 z-20">
          <AttachmentError onRetry={handleRetry} />
        </div>
      )}

      {/* Loading State - Replaces Image */}
      {!isError && showDownloadIndicator ? (
        <div className="absolute inset-0 z-10">
          <AttachmentLoader />
        </div>
      ) : (
        /* Display Image (Thumbnail) */
        !isError &&
        displaySrc && (
          <img
            src={displaySrc}
            alt={fileName}
            style={{ objectFit }}
            loading="lazy"
            decoding="async"
            className="block h-full w-full opacity-100 transition-opacity"
            onError={() => setImageError(true)}
            onLoad={handleLoad}
          />
        )
      )}

      {/* Bottom gradient overlay for timestamp visibility (media-only) */}
      {isMediaOnly && !isError && (
        <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-8 bg-gradient-to-t from-black/60 to-transparent" />
      )}

      {/* Hover overlay */}
      {!isError && displaySrc && !showDownloadIndicator && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-colors group-hover:bg-black/10 group-hover:opacity-100" />
      )}
    </Button>
  );
});

export default ImageAttachment;
