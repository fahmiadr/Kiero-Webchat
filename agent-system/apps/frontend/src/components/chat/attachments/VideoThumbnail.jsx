import { memo, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Download, Play, Video, AlertCircle, X, RefreshCw, Loader2 } from 'lucide-react';
import { useAttachment } from '@/hooks/useAttachment';
import useAttachmentProgressStore from '@/stores/useAttachmentProgressStore';
import { useAttachmentMetadata } from '@/hooks/useAttachmentMetadata'; // New Hook
import { getMetadata, saveMetadata } from '@/services/attachmentCache';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { CircularProgress } from '@/components/ui/circular-progress';
import { Badge } from '@/components/ui/badge';
import { calculateLayoutConfig } from '@/utils/mediaLayoutUtils';
import { get } from 'idb-keyval'; // For checking existence
import { useQueryClient } from '@tanstack/react-query';
import { AttachmentLoader } from '@/components/chat/attachments/AttachmentLoader';
import { AttachmentError } from '@/components/chat/attachments/AttachmentError';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { formatBytes, formatDuration } from '@/utils/formatUtils';

// Module-level caches to prevent duplicate requests across component instances
const memoryCache = new Map(); // { src: { size, duration, thumbnail } }

/**
 * VideoThumbnail Component
 * 
 * WhatsApp-style video preview with shared cache support.
 * - Uses TanStack Query for data management
 * - Thumbnails persisted to IndexedDB (Metadata Store)
 * - Video Blob persisted to IndexedDB (KeyVal Store) via useAttachment
 */
const VideoThumbnail = memo(function VideoThumbnail({
    src,
    fileName = 'Video',
    onPlay,
    className = '',
    // Upload props (for optimistic sending)
    uploadStatus = null,  // 'uploading' | 'error' | null
    uploadProgress = 0,   // 0-100
    onCancelUpload = null,
    thumbnailUrl = null,  // Pre-generated thumbnail from preview
    meta = null,          // Metadata { width, height } for instant layout
    fileSize: propFileSize, // Added
    onResize // Callback for parent dynamic sizing
}) {
    const queryClient = useQueryClient();

    // OPTIMIZATION: Initialize from cache to prevent flicker
    const cachedMeta = queryClient.getQueryData(['attachment-meta', src]);
    const cachedThumbnailBlob = (cachedMeta?.thumbnail instanceof Blob) ? cachedMeta.thumbnail : null;

    // Use Registry for Thumbnail Blob
    const thumbnailBlobUrl = useObjectUrl(cachedThumbnailBlob);

    // Derived Thumbnail URL
    const thumbnail = useMemo(() => {
        if (thumbnailUrl) return thumbnailUrl; // External prop takes precedence
        if (thumbnailBlobUrl) return thumbnailBlobUrl; // Registry URL for blob
        if (typeof cachedMeta?.thumbnail === 'string') return cachedMeta.thumbnail; // String URL
        return memoryCache.get(src)?.thumbnail || null;
    }, [thumbnailUrl, thumbnailBlobUrl, cachedMeta?.thumbnail, src]);

    const [fileSize, setFileSize] = useState(() => memoryCache.get(src)?.size || propFileSize || meta?.size || null);
    const [duration, setDuration] = useState(() => memoryCache.get(src)?.duration || meta?.duration || null);
    const [isEnabled, setIsEnabled] = useState(false); // Controls download trigger
    const [isPaused, setIsPaused] = useState(false);
    const [lastProgress, setLastProgress] = useState(0);
    // New State to prevent flicker: start as 'restoring' until we check IDB
    const [isRestoring, setIsRestoring] = useState(true);

    const mountedRef = useRef(true);
    const containerRef = useRef(null);

    // PERFORMANCE: Lazy initialization - only load heavy resources when visible
    const [isInView, setIsInView] = useState(() => {
        // Optimization: If thumbnail is already in cache, start as "in view"
        return !!(thumbnailUrl || queryClient.getQueryData(['attachment-meta', src])?.thumbnail || memoryCache.get(src)?.thumbnail);
    });

    // WhatsApp-style layout calculation - prioritize meta if it has dimensions, otherwise use metadata from hook
    const effectiveMeta = meta?.width ? meta : cachedMeta;
    const { containerStyle, objectFit } = calculateLayoutConfig(effectiveMeta, 'cover', 'video');

    // Track last reported width to parent
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

    const handleRef = useCallback((node) => {
        containerRef.current = node; // Also set the IntersectionObserver ref
    }, []);

    // TanStack Query for Video Blob
    const { data: videoBlob, isLoading: isDownloading, isError: isDownloadError } = useAttachment(src, {
        enabled: isEnabled
    });

    // Capture progress for pause state
    const currentDownloadProgress = useAttachmentProgressStore(s => s.downloadProgress[src] || 0);

    // Sync last progress only when active
    useEffect(() => {
        if (currentDownloadProgress > 0) {
            setLastProgress(currentDownloadProgress);
        }
    }, [currentDownloadProgress]);

    // Create Blob URL for video playback if downloaded using Registry
    const blobUrl = useObjectUrl(videoBlob);

    // Individual action selectors
    const handleDownload = useCallback((e) => {
        if (e) e.stopPropagation();
        setIsEnabled(true);
        setIsPaused(false);
    }, []);



    const handleCancel = useCallback(async (e) => {
        if (e) e.stopPropagation();
        setIsEnabled(false);
        setIsPaused(true);
        // Explicitly cancel the query to trigger the abort signal
        await queryClient.cancelQueries({ queryKey: ['attachment', src] });
    }, [src, queryClient]);

    // PERFORMANCE: Check IDB for existence on mount to sync UI state
    useEffect(() => {
        const checkCache = async () => {
            // If we already have videoBlob from ReactQuery or URL, no need to restore
            if (videoBlob) {
                setIsRestoring(false);
                return;
            };

            // Check if we have it in React Query Cache first (synchronous)
            const cachedData = queryClient.getQueryData(['attachment', src]);
            if (cachedData) {
                setIsRestoring(false);
                return;
            }

            // Check IDB
            try {
                const blob = await get(src);
                if (blob instanceof Blob) {
                    // Seed the cache - this will update useAttachment hook state instantly
                    queryClient.setQueryData(['attachment', src], blob);
                }
            } catch (e) {
                // ignore
            } finally {
                setIsRestoring(false);
            }
        };

        checkCache();
    }, [src, queryClient, videoBlob]);

    // PERFORMANCE: IntersectionObserver for lazy loading
    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsInView(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.01, rootMargin: '400px' }
        );

        if (containerRef.current) observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // Metadata Hook with Standard TanStack Query Retry Logic
    // Only run when in view to prevent massive network spam on mount
    const {
        metadata,
        isLoading: isMetaLoading,
        isError: isMetaError,
        isFetching: isMetaFetching,
        refetch: refetchMetadata
    } = useAttachmentMetadata(src, {
        type: 'video',
        enabled: !!src && isInView,
        // CRITICAL: Only use initialData if we have a thumbnail.
        // If we have duration/size but no thumbnail, we MUST fetch to generate one.
        initialData: meta?.thumbnail ? meta : undefined
    });

    // Derived state for Generation Error
    // If hook has error AND we lack a thumbnail, it implies invalid generation
    const generationError = isMetaError && !thumbnail;

    // Sync cached metadata (Size, Duration)
    useEffect(() => {
        if (!metadata) return;

        // 1. Thumbnail
        // Handled by useObjectUrl + useMemo above

        // 2. Size
        if (metadata.size) setFileSize(metadata.size);

        // 3. Duration
        if (metadata.duration) setDuration(metadata.duration);
    }, [metadata]);

    // Effective status
    const isCompressing = uploadStatus === 'compressing';
    const isUploading = uploadStatus === 'uploading';
    const isUploadError = uploadStatus === 'error';

    // Status Logic
    let status = 'idle';
    if (isCompressing) status = 'compressing';
    else if (isUploading) status = 'uploading';
    else if (isUploadError) status = 'upload-error';
    else if (isDownloading && isEnabled) status = 'downloading';
    else if (isPaused) status = 'paused'; // Technically unreachable if setIsPaused is never true, but safe to keep
    else if (isDownloadError) status = 'error';
    else if (videoBlob && !isDownloading) status = 'downloaded'; // Ready

    const handleRetryGeneration = useCallback((e) => {
        if (e) e.stopPropagation();
        refetchMetadata();
    }, [refetchMetadata]);

    // Handle click on the thumbnail area
    const handleAreaClick = useCallback((e) => {
        if (e) e.stopPropagation();

        // Block action if error, fetching metadata, or no thumbnail (not ready)
        // Unless it's a local file upload which might not have a thumbnail yet but has a blob
        if (isUploadError || generationError || isMetaFetching || !thumbnail) return;

        if (onPlay) {
            if (status === 'downloaded' && videoBlob) {
                onPlay(videoBlob, src); // Pass OBJECT ownership
            } else {
                // If not downloaded, play stream directly if allowed or if local blob
                const isLocal = src && src.startsWith('blob:');
                if (isLocal) {
                    onPlay(src, null);
                } else {
                    setIsEnabled(true);
                    onPlay(null, src);
                }
            }
        }
    }, [isUploadError, generationError, isMetaFetching, thumbnail, status, blobUrl, onPlay, src]);


    const isReady = !isUploadError && !generationError && !isMetaFetching && thumbnail;

    const displayProgress = (isCompressing || isUploading)
        ? uploadProgress
        : (status === 'paused' ? lastProgress : currentDownloadProgress);

    return (
        <div
            ref={handleRef}
            style={{
                ...containerStyle,
                maxWidth: '100%',
                height: 'auto',
            }}
            className={`relative group rounded-xl overflow-hidden ${isReady ? 'cursor-pointer' : 'cursor-default'} bg-transparent ${className}`}
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
                    className={"w-full h-full transition-transform group-hover:scale-105"}
                    onLoad={(e) => {
                        // Dynamically resolve dimensions of thumbnail when native meta is missing
                        if (!meta?.width && !cachedMeta?.width && e.target.naturalWidth) {
                            // Update query client cache directly since useAttachmentMetadata here is an effect abstraction
                            queryClient.setQueryData(['attachment-meta', src], old => ({
                                ...old,
                                width: e.target.naturalWidth,
                                height: e.target.naturalHeight,
                                originalWidth: e.target.naturalWidth,
                                originalHeight: e.target.naturalHeight
                            }));
                        }
                    }}
                />
            ) : (
                isMetaFetching && <AttachmentLoader />
            )}

            {/* ERROR OVERLAY: Generation Failed */}
            {generationError && !thumbnail && (
                <AttachmentError onRetry={handleRetryGeneration} />
            )}

            {/* Center Play Button Overlay (Only if no error and loaded, and not restoring) */}
            {!generationError && (thumbnail || !isMetaFetching) && !isRestoring && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors pointer-events-none">
                    <div className={`rounded-full p-4 backdrop-blur-sm group-hover:scale-110 transition-transform ${blobUrl ? 'bg-white/20' : 'bg-black/50'}`}>
                        <Play className="w-8 h-8 text-white fill-white" />
                    </div>
                </div>
            )}

            {/* Top-right Status Area */}
            <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
                {/* Compressing/Uploading: Progress indicator */}
                {(status === 'compressing' || status === 'uploading') && (
                    <div className="flex items-center gap-2">
                        <Tooltip delayDuration={500}>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={onCancelUpload}
                                    className="relative w-6 h-6 p-0 hover:bg-transparent [&_svg]:size-auto"
                                >
                                    <CircularProgress
                                        percentage={displayProgress}
                                        size={24}
                                        color={status === 'compressing' ? '#f59e0b' : '#22c55e'}
                                    />
                                    <X className="text-white absolute" style={{ width: '12px', height: '12px' }} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {status === 'compressing' ? 'Batalkan upload' : 'Batalkan upload'}
                            </TooltipContent>
                        </Tooltip>
                        <span className="text-white text-xs font-medium">
                            {status === 'compressing' ? 'Mengupload...' : `${displayProgress}%`}
                        </span>
                    </div>
                )}

                {/* Upload Error: Retry button */}
                {status === 'upload-error' && (
                    <Tooltip delayDuration={500}>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                className="h-auto px-2.5 py-1 bg-red-500/60 hover:bg-red-500/80 text-white text-xs rounded-full backdrop-blur-sm"
                            >
                                <AlertCircle className="w-3.5 h-3.5" />
                                <span>Gagal</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Upload gagal</TooltipContent>
                    </Tooltip>
                )}

                {/* Idle: Capsule download button (only after restore check) */}
                {status === 'idle' && !blobUrl && !generationError && !isMetaFetching && !isRestoring && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                onClick={handleDownload}
                                className="h-auto px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white text-xs rounded-full backdrop-blur-sm"
                            >
                                <Download className="w-3.5 h-3.5" />
                                {fileSize && <span>{formatBytes(fileSize)}</span>}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Unduh video</TooltipContent>
                    </Tooltip>
                )}

                {/* Downloading: X button with circular progress + percentage */}
                {status === 'downloading' && (
                    <div className="flex items-center gap-2">
                        <span className="text-white text-xs font-medium">{displayProgress}%</span>
                        <Tooltip delayDuration={500}>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleCancel}
                                    className="relative w-6 h-6 p-0 hover:bg-transparent [&_svg]:size-auto"
                                >
                                    <CircularProgress percentage={displayProgress} size={24} />
                                    <X className="text-white absolute" style={{ width: '12px', height: '12px' }} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Jeda</TooltipContent>
                        </Tooltip>
                    </div>
                )}

                {/* Paused: Resume button with progress indicator */}
                {status === 'paused' && (
                    <div className="flex items-center gap-2">
                        <span className="text-white text-xs font-medium">{displayProgress}%</span>
                        <Tooltip delayDuration={500}>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleDownload}
                                    className="relative w-6 h-6 p-0 hover:bg-transparent [&_svg]:size-auto"
                                >
                                    <CircularProgress percentage={displayProgress} size={24} color="#fbbf24" />
                                    <Play className="text-white absolute fill-white" style={{ width: '12px', height: '12px' }} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Lanjutkan</TooltipContent>
                        </Tooltip>
                    </div>
                )}

                {/* Error: Retry button */}
                {status === 'error' && (
                    <Tooltip delayDuration={500}>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                onClick={handleDownload}
                                className="h-auto px-2.5 py-1 bg-red-500/60 hover:bg-red-500/80 text-white text-xs rounded-full backdrop-blur-sm"
                            >
                                <AlertCircle className="w-3.5 h-3.5" />
                                <span>Gagal</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Coba unduh ulang</TooltipContent>
                    </Tooltip>
                )}
            </div>

            {/* Bottom-right Duration Badge */}
            {typeof duration === 'number' && !generationError && (
                <div className="absolute bottom-2 left-2 z-10">
                    <Badge className="bg-black/60 text-white text-[10px] px-1.5 py-0.5 border-0 backdrop-blur-sm">
                        {formatDuration(duration)}
                    </Badge>
                </div>
            )}

            {/* Bottom gradient */}
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
        </div>
    );
});

export default VideoThumbnail;
