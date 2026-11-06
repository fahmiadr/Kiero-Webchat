import { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Download, X, AlertCircle, ExternalLink, Play } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { CircularProgress } from '@/components/ui/circular-progress';
import { config } from '@/config';
import { getFileIconProps } from '@/utils/fileIcons';
import { useAttachment } from '@/hooks/useAttachment';
import useAttachmentProgressStore from '@/stores/useAttachmentProgressStore';
import { useAttachmentMetadata } from '@/hooks/useAttachmentMetadata';
import { useQueryClient } from '@tanstack/react-query';
import { get } from 'idb-keyval';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { formatBytes } from '@/utils/formatUtils';
import { MEDIA_LAYOUT } from '@/utils/mediaLayoutUtils';

/**
 * DocumentAttachment Component
 * 
 * Refactored to use:
 * - useAttachmentMetadata (Deduplicated size/type fetch)
 * - useObjectUrl (Global blob registry)
 * - Robust Open/Save logic for both local and remote files
 */
// Default dark-mode attachment styles
const DEFAULT_ATTACHMENT_STYLES = {
    icon: 'text-white/60',
    text: 'text-white/90',
    meta: 'text-white/50',
    hover: 'hover:bg-white/10',
    ready: 'text-green-400'
};

const DocumentAttachment = memo(function DocumentAttachment({
    src,
    fileName,
    fileSize: propFileSize,
    className = '',
    // Upload props for optimistic sending
    uploadStatus,
    uploadProgress = 0,
    onCancelUpload,
    attachmentStyles: attachmentStylesProp,
    onResize // Callback for parent dynamic sizing
}) {
    // Merge provided styles with defaults
    const styles = { ...DEFAULT_ATTACHMENT_STYLES, ...attachmentStylesProp };

    // Report fixed width to parent for dynamic bubble sizing (fires once on mount)
    const reportedRef = useRef(false);
    const handleRef = useCallback((node) => {
        if (node && onResize && !reportedRef.current) {
            onResize(MEDIA_LAYOUT.MAX_WIDTH);
            reportedRef.current = true;
        }
    }, [onResize]);

    // Build full URL for API
    const fullUrl = src?.startsWith('http') || src?.startsWith('blob:') ? src : `${config.apiUrl}${src}`;
    const queryClient = useQueryClient();

    // Optimization: Avoid flash if cached in session
    const [isEnabled, setIsEnabled] = useState(() => {
        if (src?.startsWith('blob:')) return false; // Local uploads don't need "downloading"
        return !!queryClient.getQueryData(['attachment', fullUrl]);
    });

    const mountedRef = useRef(true);

    // Get file extension
    const ext = fileName?.split('.').pop()?.toUpperCase() || '';
    const isPdf = ext === 'PDF';

    // Get consistent icon
    const { Icon: FileIcon, iconClass } = getFileIconProps(fileName);

    // 1. Metadata (Size) - Deduplicated
    const { metadata, isLoading: isMetaLoading } = useAttachmentMetadata(fullUrl, {
        enabled: !!fullUrl && !src?.startsWith('blob:'),
        type: 'file',
        initialData: propFileSize ? { size: propFileSize } : undefined
    });

    const fileSize = propFileSize || metadata?.size;

    // 2. Data (Blob) - Deduplicated
    const { data: fileBlob, isLoading, isError, refetch } = useAttachment(fullUrl, {
        enabled: isEnabled
    });

    // 3. Blob URL - Registry Managed
    const blobUrl = useObjectUrl(fileBlob);

    const downloadProgress = useAttachmentProgressStore(s => s.getProgress(fullUrl, 'download') || 0);

    // Check IDB on mount (Restore state)
    useEffect(() => {
        if (!fullUrl || fullUrl.startsWith('blob:')) return;

        // If we already have it in query cache, we are good
        if (queryClient.getQueryData(['attachment', fullUrl])) {
            setIsEnabled(true);
            return;
        }

        get(fullUrl).then(blob => {
            if (blob && mountedRef.current) {
                // Seed cache
                queryClient.setQueryData(['attachment', fullUrl], blob);
                setIsEnabled(true);
            }
        });
    }, [fullUrl, queryClient]);

    // Effective status
    const isUploading = uploadStatus === 'uploading';
    const isUploadError = uploadStatus === 'error';

    let status = 'idle';
    if (isUploading) status = 'uploading';
    else if (isUploadError) status = 'upload-error';
    else if (isLoading && isEnabled) status = 'downloading';
    else if (isError) status = 'error';
    else if (fileBlob && !isLoading) status = 'ready'; // Ready (Downloaded)

    const progress = isUploading ? uploadProgress : downloadProgress;

    // Active URL Strategy:
    // 1. Local Upload (blob:...) -> Use src direct
    // 2. Downloaded (blob:...) -> Use registry URL
    // 3. Remote (http:...) -> Use fullUrl (Fallback for Open/Save without waiting for download)
    const activeUrl = src?.startsWith('blob:') ? src : (blobUrl || fullUrl);

    // Ready state for interaction
    // We consider it "interactive" if we have a blob OR if it's idle (we can trigger action)
    const isReady = !!fileBlob;

    // Cleanup on unmount
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);


    // Handle download button click
    const handleDownload = useCallback((e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (!fullUrl || status === 'downloading') return;
        setIsEnabled(true);
    }, [fullUrl, status]);

    // Handle cancel/pause download
    const handleCancelDownload = useCallback((e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        setIsEnabled(false);
        queryClient.cancelQueries({ queryKey: ['attachment', fullUrl] });
    }, [fullUrl, queryClient]);

    // Handle open/save file
    const handleOpenFile = useCallback((e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        // If we have a blob interactable url (local or downloaded)
        const targetUrl = (src?.startsWith('blob:') ? src : blobUrl) || fullUrl;

        if (!targetUrl) return;

        if (isPdf) {
            // PDFs open in new tab
            window.open(targetUrl, '_blank');
        } else {
            // Others download
            const link = document.createElement('a');
            link.href = targetUrl;
            link.download = fileName || 'document';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }, [src, blobUrl, fullUrl, isPdf, fileName]);

    // Handle click on main area
    const handleClick = useCallback((e) => {
        e.preventDefault();

        if (status === 'uploading' || status === 'upload-error') return;

        // If it's ready (downloaded) or it's a PDF (can open remote), open it
        // Or if user wants to play/open
        if (status === 'ready' || src?.startsWith('blob:')) {
            handleOpenFile(e);
        } else if (status === 'idle' || status === 'error') {
            // If strictly idle, we usually download first unless it's a PDF we might want to just open?
            // User requested "efisien". 
            // Current behavior: IDLE -> DOWNLOAD. READY -> OPEN.
            handleDownload(e);
        }
    }, [status, src, handleOpenFile, handleDownload]);

    return (
        <div ref={handleRef} style={{ width: '100%', maxWidth: `${MEDIA_LAYOUT.MAX_WIDTH}px` }} className={`rounded-xl ${className}`}>
            <div
                onClick={handleClick}
                className={`flex items-center gap-3 p-3 transition-colors ${(status === 'idle' || status === 'ready' || status === 'error')
                    ? `${styles.hover} cursor-pointer`
                    : 'cursor-default'
                    }`}
            >
                {/* Left: Icon / Progress */}
                <div className="flex-shrink-0 w-10 h-10 rounded flex items-center justify-center relative">
                    {/* Uploading */}
                    {status === 'uploading' && (
                        <Tooltip delayDuration={500}>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onCancelUpload?.();
                                    }}
                                    className="absolute inset-0 w-10 h-10 p-0 hover:bg-transparent [&_svg]:size-auto"
                                >
                                    <CircularProgress percentage={progress} size={40} color="#22c55e" />
                                    <X className="w-4 h-4 text-white absolute" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Batalkan upload</TooltipContent>
                        </Tooltip>
                    )}

                    {/* Downloading */}
                    {status === 'downloading' && (
                        <Tooltip delayDuration={500}>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleCancelDownload}
                                    className="absolute inset-0 w-10 h-10 p-0 hover:bg-transparent [&_svg]:size-auto"
                                >
                                    <CircularProgress percentage={progress} size={40} />
                                    <X className="w-4 h-4 text-white absolute" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Jeda unduhan</TooltipContent>
                        </Tooltip>
                    )}

                    {/* Upload Error */}
                    {status === 'upload-error' && (
                        <Tooltip delayDuration={500}>
                            <TooltipTrigger asChild>
                                <div className="absolute inset-0 flex items-center justify-center bg-red-500/40 rounded">
                                    <AlertCircle className="w-5 h-5 text-white" />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>Upload gagal</TooltipContent>
                        </Tooltip>
                    )}

                    {/* Download Error */}
                    {status === 'error' && (
                        <Tooltip delayDuration={500}>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setIsEnabled(true);
                                        refetch();
                                    }}
                                    className="absolute inset-0 flex items-center justify-center bg-red-500/40 rounded"
                                >
                                    <AlertCircle className="w-5 h-5 text-white" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>Coba unduh ulang</TooltipContent>
                        </Tooltip>
                    )}

                    {/* Idle or Ready: File icon */}
                    {(status === 'idle' || status === 'ready') && (
                        <FileIcon className={`${iconClass} ${styles.icon}`} />
                    )}
                </div>

                {/* Center: File info */}
                <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium truncate ${styles.text}`}>
                        {fileName || 'Document'}
                    </p>
                    <div className={`flex items-center gap-2 text-[10px] ${styles.meta}`}>
                        <span className="uppercase">{ext || 'FILE'}</span>
                        {fileSize && (
                            <>
                                <span>•</span>
                                <span>{formatBytes(fileSize)}</span>
                            </>
                        )}
                        {status === 'ready' && !isUploading && (
                            <>
                                <span>•</span>
                                <span className={styles.ready}>Siap</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Right: Action icon */}
                {status === 'idle' && !isReady && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex-shrink-0">
                                <Download className={`w-4 h-4 ${styles.icon}`} />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>Unduh dokumen</TooltipContent>
                    </Tooltip>
                )}

                {(status === 'ready' || src?.startsWith('blob:')) && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex-shrink-0">
                                {isPdf ? (
                                    <ExternalLink className={`w-4 h-4 ${styles.icon}`} />
                                ) : (
                                    <Download className={`w-4 h-4 ${styles.icon}`} />
                                )}
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>{isPdf ? 'Buka PDF' : 'Simpan file'}</TooltipContent>
                    </Tooltip>
                )}
            </div>
        </div>
    );
});

export default DocumentAttachment;
