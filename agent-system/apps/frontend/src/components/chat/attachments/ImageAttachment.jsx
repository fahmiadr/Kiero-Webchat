import { memo, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { X, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CircularProgress } from '@/components/ui/circular-progress';
import { calculateLayoutConfig } from '@/utils/mediaLayoutUtils';
import { useAttachment } from '@/hooks/useAttachment';
import { useAttachmentMetadata } from '@/hooks/useAttachmentMetadata';
import { generateThumbnail } from '@/utils/generateThumbnail';
import { useQueryClient } from '@tanstack/react-query';
import { AttachmentLoader } from '@/components/chat/attachments/AttachmentLoader';
import { AttachmentError } from '@/components/chat/attachments/AttachmentError';
import { useObjectUrl } from '@/hooks/useObjectUrl';

/**
 * ImageAttachment Component (Fetch-First Pattern)
 * 
 * Refactored to use TanStack Query via useAttachment hook.
 */
const ImageAttachment = memo(function ImageAttachment({
    src,
    fileName,
    previewUrl, // Local blob URL (Full Resolution) for preview
    thumbnailUrl: externalThumbnailUrl, // Local blob URL (Thumbnail) for upload preview
    onClick,
    className = '',
    // Upload props for optimistic sending
    uploadStatus,
    uploadProgress = 0,
    onCancelUpload,
    meta, // Metadata { width, height } for instant layout
    fileSize, // Added for metadata completeness
    onResize // Callback for parent dynamic sizing
}) {
    const [imageError, setImageError] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const mountedRef = useRef(true);
    const containerRef = useRef(null);

    // PERFORMANCE: Lazy initialization
    // Optimization: If data is already in cache, start as "in view" to valid flash on mount
    const queryClient = useQueryClient();
    const [isInView, setIsInView] = useState(() => {
        return !!queryClient.getQueryData(['attachment', src]);
    });

    // Metadata Hook
    const { metadata, updateMetadata, isLoading: isMetaLoading } = useAttachmentMetadata(src, {
        type: 'image',
        initialData: { ...meta, size: fileSize }
    });
    const isGeneratingRef = useRef(false);

    // TanStack Query
    // Only enable query if in view AND not uploading. We DO fetch full image to cache it.
    // OPTIMIZATION: Skip query completely for local 'blob:' URLs
    const isBlobUrl = src?.startsWith('blob:');
    const { data: imageBlob, isLoading: isDownloading, isError: isDownloadError, refetch } = useAttachment(src, {
        enabled: isInView && !isBlobUrl
    });

    // Create Blob URL for Full Image using Registry (deduplicated)
    const blobUrl = useObjectUrl(imageBlob);

    // Local Thumbnail URL (Internal)
    // Use Registry for Thumbnail Blob as well
    const thumbnailBlob = (metadata?.thumbnail instanceof Blob) ? metadata.thumbnail : null;
    const thumbnailBlobUrl = useObjectUrl(thumbnailBlob);

    // Derived Thumbnail URL (String or Blob URL)
    const thumbnailUrl = useMemo(() => {
        if (thumbnailBlobUrl) return thumbnailBlobUrl;
        if (typeof metadata?.thumbnail === 'string') return metadata.thumbnail;
        return null;
    }, [thumbnailBlobUrl, metadata?.thumbnail]);

    // Track generation state
    const [isGenerating, setIsGenerating] = useState(false);

    // Generate Thumbnail if missing and full image available
    useEffect(() => {
        if (!src || src.startsWith('blob:') || previewUrl || externalThumbnailUrl) return;

        // Condition: Full Blob loaded, No Thumbnail yet, Not currently generating, AND Metadata check finished
        if (imageBlob && !metadata?.thumbnail && !isGeneratingRef.current && !isMetaLoading) {
            isGeneratingRef.current = true;
            setIsGenerating(true); // Update UI state

            generateThumbnail(imageBlob).then(result => {
                if (result) {
                    // Update metadata with thumbnail
                    updateMetadata({
                        thumbnail: result.blob,
                        width: result.width,
                        height: result.height,
                        originalWidth: result.originalWidth,
                        originalHeight: result.originalHeight
                    });
                }
                isGeneratingRef.current = false;
                setIsGenerating(false);
            });
        }
    }, [imageBlob, metadata, src, previewUrl, externalThumbnailUrl, updateMetadata, isMetaLoading]);

    // WhatsApp-style layout calculation - prioritize meta if it has dimensions, otherwise use metadata from hook
    const effectiveMeta = meta?.width ? meta : metadata;
    const { containerStyle, objectFit } = calculateLayoutConfig(effectiveMeta, 'contain', 'image');

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

    // Effective source priority
    const isLocal = src?.startsWith('blob:');

    // Priority: 
    // 1. External Thumbnail (from Upload Bubble)
    // 2. Internal Thumbnail (from Metadata/IDB)
    // 3. Preview URL (Full Res - Fallback)
    // 4. Local Blob (if src is blob)
    const effectiveSrc = externalThumbnailUrl || thumbnailUrl || previewUrl || (isLocal ? src : null);

    // Loading includes Downloading OR Generating
    const isLoading = (!effectiveSrc && !imageError && !isDownloadError && uploadStatus !== 'error') || isGenerating;

    // Derive status (compressing → uploading → idle/error)
    const isCompressing = uploadStatus === 'compressing';
    const isUploading = uploadStatus === 'uploading';
    const isUploadError = uploadStatus === 'error';
    const status = isCompressing ? 'compressing' : isUploading ? 'uploading' : isUploadError ? 'upload-error' : 'idle';
    const progress = uploadProgress;

    // Cleanup on unmount
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // PERFORMANCE: IntersectionObserver for lazy rendering
    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsInView(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.01, rootMargin: '400px' } // Pre-load 400px before visible
        );

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => observer.disconnect();
    }, []);

    // Handle image load
    const handleImageLoad = useCallback((e) => {
        setImageLoaded(true);
        if (!meta?.width && !metadata?.width && e.target.naturalWidth) {
            updateMetadata({
                ...metadata,
                width: e.target.naturalWidth,
                height: e.target.naturalHeight,
                originalWidth: e.target.naturalWidth,
                originalHeight: e.target.naturalHeight
            });
        }
    }, [meta, metadata, updateMetadata]);

    // Handle image error
    const handleImageError = useCallback(() => {
        setImageError(true);
    }, []);

    // Handle click
    const handleClick = useCallback(() => {
        // Don't open viewer during upload, error, or loading
        if (status === 'uploading' || status === 'upload-error' || isLoading || isDownloadError || imageError) return;
        onClick?.();
    }, [status, isLoading, isDownloadError, imageError, onClick]);

    // Handle cancel upload
    const handleCancelClick = useCallback((e) => {
        e.stopPropagation();
        onCancelUpload?.();
    }, [onCancelUpload]);

    return (
        <div
            ref={handleRef}
            onClick={handleClick}
            style={{
                ...containerStyle,
                maxWidth: '100%',
                height: 'auto',
                transform: 'translateZ(0)',
            }}
            className={`block relative group bg-transparent overflow-hidden rounded-xl ${(status === 'idle' && !isLoading) ? 'cursor-pointer' : 'cursor-default'} ${className}`}
        >
            {/* Loading State - Replaced with AttachmentLoader */}
            {isLoading && (
                <AttachmentLoader />
            )}

            {/* Error State - Compact placeholder */}
            {imageError && !isLoading && (
                <div className="w-full h-full bg-neutral-800 flex items-center justify-center p-8">
                    <div className="text-center">
                        <ImageIcon className="w-8 h-8 text-white/40 mx-auto mb-2" />
                        <p className="text-xs text-white/50">Gagal memuat gambar</p>
                    </div>
                </div>
            )}

            {/* Image */}
            {effectiveSrc && !imageError && (
                <img
                    src={effectiveSrc}
                    alt={fileName || 'Image'}
                    style={{ objectFit }}
                    loading="eager"
                    decoding="auto"
                    className={`block w-full h-full transition-opacity ${(status === 'uploading') ? 'opacity-60' : 'opacity-100'}`}
                    onLoad={handleImageLoad}
                    onError={handleImageError}
                />
            )}

            {/* Bottom gradient overlay */}
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />

            {/* Hover overlay (only when idle and loaded) */}
            {status === 'idle' && !isLoading && !imageError && !isDownloadError && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                    <ImageIcon className="text-white w-6 h-6 drop-shadow-md" />
                </div>
            )}

            {/* Compression/Upload Progress Overlay */}
            {(status === 'compressing' || status === 'uploading') && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="flex flex-col items-center gap-2">
                        <Tooltip delayDuration={500}>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={handleCancelClick}
                                    className="relative flex items-center justify-center"
                                >
                                    <CircularProgress
                                        percentage={progress}
                                        size={48}
                                        color={status === 'compressing' ? '#f59e0b' : '#22c55e'}
                                    />
                                    <X className="w-5 h-5 text-white absolute" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {status === 'compressing' ? 'Batalkan upload' : 'Batalkan upload'}
                            </TooltipContent>
                        </Tooltip>
                        <span className="text-white text-sm font-medium drop-shadow-md">
                            {status === 'compressing' ? 'Mengupload...' : `${progress}%`}
                        </span>
                    </div>
                </div>
            )}

            {/* Upload Error Overlay */}
            {status === 'upload-error' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Tooltip delayDuration={500}>
                        <TooltipTrigger asChild>
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-12 h-12 rounded-full bg-red-500/60 flex items-center justify-center">
                                    <AlertCircle className="w-6 h-6 text-white" />
                                </div>
                                <span className="text-white text-xs font-medium">Upload gagal</span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>Upload gagal</TooltipContent>
                    </Tooltip>
                </div>
            )}

            {/* Download/Load Error Overlay */}
            {(isDownloadError || imageError) && (
                <AttachmentError onRetry={() => { setImageError(false); refetch(); }} />
            )}
        </div>
    );
});

export default ImageAttachment;
