import { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Play, Pause, Volume2, VolumeX, Download, Music, X, AlertCircle } from 'lucide-react';
import { useAttachment } from '@/hooks/useAttachment';
import useAttachmentProgressStore from '@/stores/useAttachmentProgressStore';
import { useAttachmentMetadata } from '@/hooks/useAttachmentMetadata'; // New Hook
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { CircularProgress } from '@/components/ui/circular-progress';
import { motion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { get } from 'idb-keyval'; // Direct IDB check
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { formatBytes, formatDuration } from '@/utils/formatUtils';
import { MEDIA_LAYOUT } from '@/utils/mediaLayoutUtils';

/**
 * Custom AudioPlayer Component - Download-First Design
 * 
 * Refactored to use TanStack Query via useAttachment hook and useAttachmentMetadata.
 * Aligned with VideoThumbnail.jsx architecture for robustness.
 */
// Default dark-mode player styles (used when no playerStyles prop is provided)
const DEFAULT_PLAYER_STYLES = {
    bg: 'bg-white/20',
    button: 'bg-white/20 hover:bg-white/30 text-white',
    track: 'bg-white/20',
    fill: 'bg-white/80',
    thumb: 'bg-white',
    text: 'text-white/70'
};

const AudioPlayer = memo(function AudioPlayer({
    src,
    fileName,
    className = '',
    fileSize: propFileSize,
    // Upload props for optimistic sending
    uploadStatus,
    uploadProgress = 0,
    onCancelUpload,
    meta,
    playerStyles: playerStylesProp,
    onResize // Callback for parent dynamic sizing
}) {
    // Merge provided styles with defaults
    const styles = { ...DEFAULT_PLAYER_STYLES, ...playerStylesProp };

    // Report fixed width to parent for dynamic bubble sizing (fires once on mount)
    const reportedRef = useRef(false);
    const handleRef = useCallback((node) => {
        if (node && onResize && !reportedRef.current) {
            onResize(MEDIA_LAYOUT.MAX_WIDTH);
            reportedRef.current = true;
        }
    }, [onResize]);
    const queryClient = useQueryClient();
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(meta?.duration || 0);
    const [fileSize, setFileSize] = useState(propFileSize || meta?.size || null);
    const [isMuted, setIsMuted] = useState(false);
    const [hoverSeek, setHoverSeek] = useState(false);
    const [isDraggingSeek, setIsDraggingSeek] = useState(false);
    const [shouldAutoPlay, setShouldAutoPlay] = useState(false);
    const [isRestoring, setIsRestoring] = useState(true);

    // Optimization: If loaded in session, start enabled (avoid flash)
    const [isEnabled, setIsEnabled] = useState(() => !!queryClient.getQueryData(['attachment', src]));

    const audioRef = useRef(null);
    const progressRef = useRef(null);
    const mountedRef = useRef(true);

    // Effective status shortcuts
    const isCompressing = uploadStatus === 'compressing';
    const isUploading = uploadStatus === 'uploading';
    const isUploadError = uploadStatus === 'error';

    // PERFORMANCE: Check IDB for existence on mount to sync UI state
    useEffect(() => {
        const checkCache = async () => {
            // If already enabled or has data in query cache, no need to restore
            const cachedData = queryClient.getQueryData(['attachment', src]);
            if (cachedData || isEnabled) {
                if (cachedData) setIsEnabled(true);
                setIsRestoring(false);
                return;
            }

            if (!src || src.startsWith('blob:')) {
                setIsRestoring(false);
                return;
            }

            // Check IDB
            try {
                const blob = await get(src);
                if (blob instanceof Blob) {
                    // Seed the cache - this will update useAttachment hook state instantly
                    queryClient.setQueryData(['attachment', src], blob);
                    setIsEnabled(true);
                }
            } catch (e) {
                // ignore
            } finally {
                setIsRestoring(false);
            }
        };

        checkCache();
    }, [src, queryClient, isEnabled]);

    // TanStack Query for Audio Blob
    const { data: audioBlob, isLoading, isError, refetch } = useAttachment(src, {
        enabled: isEnabled
    });

    // Capture progress
    const downloadProgress = useAttachmentProgressStore(s => s.getProgress(src, 'download') || 0);

    // Create Blob URL for audio playback if downloaded
    // Use shared hook for consistent lifecycle management (Strict Mode safe)
    const blobUrl = useObjectUrl(audioBlob);

    // Metadata Hook
    const {
        metadata,
        isLoading: isMetaLoading
    } = useAttachmentMetadata(src, {
        type: 'audio',
        enabled: !!src,
        initialData: meta
    });

    // Sync cached metadata (Duration, Size)
    useEffect(() => {
        if (!metadata) return;
        if (metadata.size) setFileSize(metadata.size);
        if (metadata.duration) setDuration(metadata.duration);
    }, [metadata]);

    // Effective status logic
    let status = 'idle';
    if (isCompressing) status = 'compressing';
    else if (isUploading) status = 'uploading';
    else if (isUploadError) status = 'upload-error';
    else if (isLoading && isEnabled) status = 'downloading';
    else if (isError) status = 'error';
    else if (audioBlob && !isLoading) status = 'downloaded'; // Ready
    else if (!isEnabled && downloadProgress > 0 && !audioBlob) status = 'paused';

    // DEFENSIVE: If src is a blob URL but we're NOT actively uploading, return null
    const isBlobSrc = src?.startsWith('blob:');
    if (isBlobSrc && !isCompressing && !isUploading && !isUploadError) {
        return null;
    }

    const displayProgress = (isCompressing || isUploading) ? uploadProgress : downloadProgress;

    // CRITICAL: Only use raw blob URL during active upload phases.
    const activeSource = (isCompressing || isUploading) && isBlobSrc ? src : blobUrl;
    // Ready only if we have a source, not uploading/compressing, and not checking cache
    const isReady = !!activeSource && !isCompressing && !isUploading && !isRestoring;

    // Cleanup on unmount
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // Auto-play when ready
    useEffect(() => {
        if (shouldAutoPlay && isReady && audioRef.current) {
            const playPromise = audioRef.current.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    setIsPlaying(true);
                    setShouldAutoPlay(false);
                }).catch(() => setShouldAutoPlay(false));
            }
        }
    }, [shouldAutoPlay, isReady]);

    // Handle Play (Idle) or Download button click used as Play
    const handlePlayIdle = useCallback(async (e) => {
        if (e) e.stopPropagation();
        if (!src || status === 'downloading') return;

        setShouldAutoPlay(true);

        // Use activeSource (which is the safe blobUrl provided by our hook)
        if (isBlobSrc || activeSource) return;

        // Trigger download
        setIsEnabled(true);
    }, [src, status, isBlobSrc, activeSource]);

    // Handle cancel/pause download
    const handleCancelDownload = useCallback((e) => {
        if (e) e.stopPropagation();
        setIsEnabled(false);
        queryClient.cancelQueries({ queryKey: ['attachment', src] });
    }, [src, queryClient]);

    // Play/Pause toggle
    const togglePlay = useCallback(() => {
        if (!isReady) return;
        if (isPlaying) {
            audioRef.current?.pause();
        } else {
            setShouldAutoPlay(true);
            audioRef.current?.play();
        }
    }, [isPlaying, isReady]);

    // Handle time update
    const handleTimeUpdate = useCallback(() => {
        if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
    }, []);

    const handleLoadedMetadata = useCallback(() => {
        if (audioRef.current && audioRef.current.duration) setDuration(audioRef.current.duration);
    }, []);

    const handleEnded = useCallback(() => {
        setIsPlaying(false);
        setCurrentTime(0);
        if (audioRef.current) audioRef.current.currentTime = 0;
    }, []);

    const handleSeek = useCallback((e) => {
        if (!audioRef.current || !duration || !isReady) return;
        const newTime = parseFloat(e.target.value);
        audioRef.current.currentTime = newTime;
        setCurrentTime(newTime);
    }, [duration, isReady]);

    const toggleMute = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.muted = !isMuted;
            setIsMuted(!isMuted);
        }
    }, [isMuted]);

    const handleSaveFile = useCallback(() => {
        // Prio 1: Save from Blob directly if downloaded (Safest)
        if (audioBlob) {
            const saveUrl = URL.createObjectURL(audioBlob);
            const link = document.createElement('a');
            link.href = saveUrl;
            link.download = fileName || 'audio';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            // Revoke immediately since we just created it for this click
            setTimeout(() => URL.revokeObjectURL(saveUrl), 100);
            return;
        }

        // Prio 2: Save from remote URL (Network fetch)
        if (!src) return;

        const link = document.createElement('a');
        link.href = src;
        link.download = fileName || 'audio';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, [audioBlob, fileName, src]);


    const isLoadingData = !duration && !fileSize && isMetaLoading;

    // ===== RENDER: NOT READY (Download First) =====
    if (!isReady) {
        return (
            <div ref={handleRef} style={{ width: '100%', maxWidth: `${MEDIA_LAYOUT.MAX_WIDTH}px` }} className={`rounded-xl ${className}`}>
                <div className="flex items-center gap-3 p-3">
                    {/* Left: Music icon — always visible */}
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full ${styles.button.split(' ')[0]} flex items-center justify-center`}>
                        <Music className={`w-5 h-5 ${styles.text}`} />
                    </div>

                    {/* Center: File info */}
                    <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium truncate ${styles.text}`}>{fileName || 'Audio'}</p>
                        <div className={`flex items-center gap-2 text-[10px] ${styles.text} opacity-70`}>
                            {duration > 0 && <span>{formatDuration(duration)}</span>}
                            {(duration > 0 && (fileSize || propFileSize)) && <span>•</span>}
                            {(fileSize || propFileSize) && <span>{formatBytes(fileSize || propFileSize)}</span>}
                            {isLoadingData && !isRestoring && (
                                <span className="animate-pulse">Memuat...</span>
                            )}
                        </div>
                    </div>

                    {/* Right: Action controls */}
                    <div className="flex-shrink-0 flex items-center justify-center relative w-8 h-8">
                        {status === 'idle' && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={handlePlayIdle}
                                        className={`absolute inset-0 w-8 h-8 rounded-full ${styles.button}`}
                                    >
                                        <Play className="w-4 h-4 fill-current ml-0.5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Unduh Audio</TooltipContent>
                            </Tooltip>
                        )}

                        {/* Compressing/Uploading */}
                        {(status === 'compressing' || status === 'uploading') && (
                            <Tooltip delayDuration={500}>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={onCancelUpload}
                                        className="absolute inset-0 w-8 h-8 p-0 hover:bg-transparent [&_svg]:size-auto"
                                    >
                                        <CircularProgress
                                            percentage={displayProgress}
                                            size={32}
                                            color={status === 'compressing' ? '#f59e0b' : '#22c55e'}
                                        />
                                        <X className={`w-3.5 h-3.5 absolute ${styles.text}`} />
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
                                        className="absolute inset-0 w-8 h-8 p-0 hover:bg-transparent [&_svg]:size-auto"
                                    >
                                        <CircularProgress percentage={displayProgress} size={32} />
                                        <X className={`absolute ${styles.text}`} style={{ width: '16px', height: '16px' }} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Jeda</TooltipContent>
                            </Tooltip>
                        )}

                        {/* Paused */}
                        {status === 'paused' && (
                            <Tooltip delayDuration={500}>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={handlePlayIdle}
                                        className="absolute inset-0 w-8 h-8 p-0 hover:bg-transparent [&_svg]:size-auto"
                                    >
                                        <CircularProgress percentage={displayProgress} size={32} color="#fbbf24" />
                                        <Play className={`absolute fill-current ${styles.text} `} style={{ width: '16px', height: '16px' }} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Lanjutkan</TooltipContent>
                            </Tooltip>
                        )}

                        {/* Error states */}
                        {(status === 'error' || status === 'upload-error') && (
                            <Tooltip delayDuration={500}>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={status === 'error' ? () => { setIsEnabled(true); refetch(); } : undefined}
                                        className="absolute inset-0 w-8 h-8 p-0 bg-red-500/40 rounded-full hover:bg-red-500/60 transition-colors"
                                    >
                                        <AlertCircle className="w-4 h-4 text-white" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>{status === 'error' ? 'Coba unduh ulang' : 'Upload gagal'}</TooltipContent>
                            </Tooltip>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ===== RENDER: READY (Full Player) =====
    return (
        <div ref={handleRef} style={{ width: '100%', maxWidth: `${MEDIA_LAYOUT.MAX_WIDTH}px` }} className={`rounded-xl ${className}`}>
            <audio
                ref={audioRef}
                src={activeSource}
                preload="none"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleEnded}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
            />

            <div className="flex items-center gap-2 px-2 py-1.5">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={togglePlay}
                            className={`flex-shrink-0 w-8 h-8 rounded-full ${styles.button}`}
                        >
                            {isPlaying ? (
                                <Pause className="w-4 h-4 fill-current" />
                            ) : (
                                <Play className="w-4 h-4 fill-current ml-0.5" />
                            )}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{isPlaying ? 'Jeda' : 'Putar'}</TooltipContent>
                </Tooltip>

                <div
                    ref={progressRef}
                    className="group flex-1 relative h-5 flex items-center cursor-pointer min-w-0"
                    onMouseMove={() => setHoverSeek(true)}
                    onMouseLeave={() => setHoverSeek(false)}
                >
                    <input
                        type="range"
                        min={0}
                        max={duration || 0}
                        step={0.01}
                        value={currentTime}
                        onChange={handleSeek}
                        onMouseDown={() => setIsDraggingSeek(true)}
                        onMouseUp={() => setIsDraggingSeek(false)}
                        className="absolute z-10 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className={`w-full h-1 ${styles.track} rounded-full overflow-hidden pointer-events-none`}>
                        <motion.div
                            className={`h-full ${styles.fill} origin-left`}
                            style={{ scaleX: duration > 0 ? currentTime / duration : 0 }}
                            transition={{ type: "tween", duration: 0.05, ease: "linear" }}
                        />
                    </div>
                    <motion.div
                        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
                        style={{ left: duration > 0 ? `calc(${(currentTime / duration) * 100}% - ${(currentTime / duration) * 12}px)` : 0 }}
                    >
                        <div className={`w-full h-full ${styles.thumb} rounded-full shadow-md flex items-center justify-center`}>
                            <motion.div
                                className={`w-full h-full ${styles.fill} rounded-full`}
                                animate={{ scale: hoverSeek || isDraggingSeek ? 0.75 : 0.5 }}
                            />
                        </div>
                    </motion.div>
                </div>

                <span className={`text-[11px] ${styles.text} font-mono flex-shrink-0 min-w-[65px] text-right`}>
                    {formatDuration(currentTime)}/{formatDuration(duration)}
                </span>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleMute}
                            className={`w-6 h-6 p-0 flex-shrink-0 ${styles.button.split(' ').find(c => c.startsWith('hover:')) || 'hover:bg-white/20'}`}
                        >
                            {isMuted ? <VolumeX className={`w-3.5 h-3.5 ${styles.text}`} /> : <Volume2 className={`w-3.5 h-3.5 ${styles.text}`} />}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{isMuted ? 'Aktifkan suara' : 'Bisukan'}</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleSaveFile}
                            className={`w-6 h-6 p-0 flex-shrink-0 ${styles.button.split(' ').find(c => c.startsWith('hover:')) || 'hover:bg-white/20'}`}
                        >
                            <Download className={`w-3.5 h-3.5 ${styles.text}`} />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Simpan audio</TooltipContent>
                </Tooltip>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 pb-1.5 -mt-0.5">
                <Music className={`w-2.5 h-2.5 ${styles.text} opacity-60 flex-shrink-0`} />
                <span className={`text-[10px] ${styles.text} opacity-70 truncate`}>{fileName || 'Audio'}</span>
            </div>
        </div>
    );
});

export default AudioPlayer;
