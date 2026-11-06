import { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    X,
    Download,
    Play,
    Pause,
    Volume2,
    VolumeX,
    Maximize,
    Minimize
} from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "motion/react";
import { useQueryClient } from '@tanstack/react-query';
import { get } from 'idb-keyval'; // Direct IDB access
import { useAttachment } from '@/hooks/useAttachment'; // New Hook
import useAttachmentProgressStore from '@/stores/useAttachmentProgressStore'; // Progress Store
import { getMetadata, saveMetadata } from '@/services/attachmentCache'; // Cache Metadata
import { formatDuration } from '@/utils/formatUtils';


/**
 * VideoPlayer Component (Custom UI matching ImageViewer)
 * 
 * Features:
 * - Custom controls overlay (Play/Pause, Seek, Volume, Fullscreen)
 * - Auto-hiding header/footer on mouse inactivity
 * - Keyboard shortcuts (Space, Arrows, Esc, M)
 * - Shared cache with VideoThumbnail (no duplicate downloads)
 * - Matches ImageViewer aesthetic
 */
const VideoPlayer = memo(({ src, streamingSrc, fileName, onClose }) => {
    // Determine effective source key (prioritize streamingSrc if available)
    const effectiveKey = streamingSrc || src;

    // Use TanStack Query Hook
    // Default enabled: true (we want to load the video immediately when player opens)
    const { data: videoBlob, isLoading: isQueryLoading } = useAttachment(effectiveKey);

    // Get Download Progress from Store
    const downloadProgress = useAttachmentProgressStore(state => state.downloadProgress[effectiveKey] || 0);

    // Create Blob URL
    // We memoize this to prevent flickering
    const blobUrl = useMemo(() => videoBlob ? URL.createObjectURL(videoBlob) : null, [videoBlob]);

    // Cleanup Blob URL
    useEffect(() => {
        return () => {
            if (blobUrl) URL.revokeObjectURL(blobUrl);
        };
    }, [blobUrl]);

    const queryClient = useQueryClient();

    // PERFORMANCE: Double-check IDB for existence on mount (Fail-safe for direct access or refresh)
    useEffect(() => {
        const checkCache = async () => {
            if (videoBlob || !effectiveKey) return;

            // Check if we have it in React Query Cache first
            const cachedData = queryClient.getQueryData(['attachment', effectiveKey]);
            if (cachedData) return;

            // Check IDB
            try {
                const blob = await get(effectiveKey);
                if (blob instanceof Blob) {
                    console.log('[VideoPlayer] Found in IDB, seeding cache:', effectiveKey);
                    queryClient.setQueryData(['attachment', effectiveKey], blob);
                }
            } catch (e) {
                // ignore
            }
        };

        checkCache();
    }, [effectiveKey, queryClient, videoBlob]);

    // Use Blob URL if available, otherwise fallback to src (if not blob:), but really we wait for download usually?
    // If we have streamingSrc (remote), and no blob yet -> we are downloading.
    // If we have src (local/blob), we can use it directly?
    // Usually VideoPlayer is passed the REMOTE url as 'streamingSrc' and maybe a local preview as 'src'?

    // Safe Blob Ownership:
    // If 'src' is a Blob OBJECT (passed from Thumbnail), we create our own URL.
    // This allows Thumbnail to unmount safely without killing our playback.
    const [localSrc, setLocalSrc] = useState(null);

    useEffect(() => {
        let url = null;
        if (src instanceof Blob) {
            url = URL.createObjectURL(src);
            setLocalSrc(url);
        } else {
            setLocalSrc(null);
        }
        return () => {
            if (url) URL.revokeObjectURL(url);
        };
    }, [src]);

    // Logic:
    // 1. Local Blob Object (Ownership) - Prioritized
    // 2. Internal Blob (Cached) - Robust
    // 3. Props 'src' string - Fallback (e.g. Local Upload)
    // 4. Streaming Src - Fallback (Remote)
    const videoSrc = localSrc || blobUrl || (typeof src === 'string' && !src.startsWith('http') ? src : null) || streamingSrc;

    // Loading state: If no videoSrc (and we are fetching remote)
    const isLoading = !videoSrc && isQueryLoading;

    // Restore position from cache
    const [initialTime, setInitialTime] = useState(0);

    useEffect(() => {
        const loadPos = async () => {
            try {
                const meta = await getMetadata(effectiveKey);
                if (meta?.playbackPosition) {
                    setInitialTime(meta.playbackPosition);
                }
            } catch (e) { }
        };
        loadPos();
    }, [effectiveKey]);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [isDraggingSeek, setIsDraggingSeek] = useState(false);
    const [hoverSeek, setHoverSeek] = useState(false);
    const [hoverVol, setHoverVol] = useState(false);
    const [isVolumeActive, setIsVolumeActive] = useState(false);
    const [isTruncated, setIsTruncated] = useState(false);
    const prevVolumeRef = useRef(1);
    const lastVolClientXRef = useRef(null);
    const fileNameRef = useRef(null);

    const videoRef = useRef(null);
    const containerRef = useRef(null);
    const volContainerRef = useRef(null);
    const hideTimeoutRef = useRef(null);
    const volumeTimeoutRef = useRef(null);
    const wasPlayingRef = useRef(false);
    const animationFrameRef = useRef(null);
    const currentTimeRef = useRef(initialTime); // Track latest time for cleanup

    // Sync ref with state
    useEffect(() => {
        currentTimeRef.current = currentTime;
    }, [currentTime]);

    // Save position on Unmount
    useEffect(() => {
        return () => {
            const pos = currentTimeRef.current;
            if (pos > 0) {
                // Save to IDB Metadata
                saveMetadata(effectiveKey, { playbackPosition: pos }).catch(() => { });
            }
        };
    }, [effectiveKey]);

    // Check truncation
    useEffect(() => {
        const checkTruncation = () => {
            if (fileNameRef.current) {
                setIsTruncated(fileNameRef.current.scrollWidth > fileNameRef.current.clientWidth);
            }
        };

        checkTruncation();
        const timer = setTimeout(checkTruncation, 100);

        window.addEventListener('resize', checkTruncation);
        return () => {
            window.removeEventListener('resize', checkTruncation);
            clearTimeout(timer);
        };
    }, [fileName]);


    // Reset hide timeout on mouse movement
    const resetHideTimeout = useCallback(() => {
        setControlsVisible(true);
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        if (!isPlaying) return;
        hideTimeoutRef.current = setTimeout(() => setControlsVisible(false), 3000);
    }, [isPlaying]);

    useEffect(() => {
        resetHideTimeout();
        return () => {
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        };
    }, [resetHideTimeout]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            resetHideTimeout();
            switch (e.key) {
                case 'Escape': onClose(); break;
                case ' ':
                case 'k':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'ArrowLeft':
                    if (videoRef.current) {
                        videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
                    }
                    break;
                case 'ArrowRight':
                    if (videoRef.current) {
                        videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 5);
                    }
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    handleVolumeChange(Math.min(1, volume + 0.1));
                    activateVolume();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    handleVolumeChange(Math.max(0, volume - 0.1));
                    activateVolume();
                    break;
                case 'm': toggleMute(); break;
                case 'f': toggleFullscreen(); break;
                default: break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose, resetHideTimeout, volume, duration]);

    // Robust Duration Check
    useEffect(() => {
        if (videoRef.current && videoRef.current.duration && !Number.isNaN(videoRef.current.duration)) {
            setDuration(videoRef.current.duration);
        }
    }, [videoSrc]); // Check when src changes

    // Smooth progress update using requestAnimationFrame (60fps)
    useEffect(() => {
        const updateProgress = () => {
            if (videoRef.current && !isDraggingSeek && isPlaying) {
                const now = videoRef.current.currentTime;
                setCurrentTime(now);
            }
            animationFrameRef.current = requestAnimationFrame(updateProgress);
        };

        if (isPlaying && !isDraggingSeek) {
            animationFrameRef.current = requestAnimationFrame(updateProgress);
        }

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [isPlaying, isDraggingSeek]);

    // Fallback time update for when paused
    const handleTimeUpdate = () => {
        if (videoRef.current && !isDraggingSeek && !isPlaying) {
            setCurrentTime(videoRef.current.currentTime);
        }
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            if (!Number.isNaN(videoRef.current.duration)) {
                setDuration(videoRef.current.duration);
            }
            // Restore position
            if (initialTime > 0) {
                videoRef.current.currentTime = initialTime;
                setCurrentTime(initialTime);
            }
            videoRef.current.play().catch(() => { });
            setIsPlaying(true);
        }
    };

    const handleDurationChange = () => {
        if (videoRef.current && !Number.isNaN(videoRef.current.duration)) {
            setDuration(videoRef.current.duration);
        }
    };

    const handleEnded = () => {
        setIsPlaying(false);
        if (videoRef.current) {
            videoRef.current.currentTime = 0;
            setCurrentTime(0);
        }
    };

    const togglePlay = useCallback(() => {
        if (videoRef.current) {
            if (isPlaying) videoRef.current.pause();
            else videoRef.current.play();
            setIsPlaying(!isPlaying);
        }
    }, [isPlaying]);

    const handleSeek = (e) => {
        const time = parseFloat(e.target.value);
        if (!duration || Number.isNaN(duration) || Number.isNaN(time)) {
            console.warn('VideoPlayer: Cannot seek - duration not loaded yet');
            return;
        }
        setCurrentTime(time);
        if (videoRef.current) {
            videoRef.current.currentTime = time;
        }
    };

    const handleSeekStart = () => {
        setIsDraggingSeek(true);
        if (isPlaying) {
            wasPlayingRef.current = true;
            videoRef.current?.pause();
        } else {
            wasPlayingRef.current = false;
        }
    };

    const handleSeekEnd = () => {
        setIsDraggingSeek(false);
        if (wasPlayingRef.current) {
            videoRef.current?.play();
            setIsPlaying(true);
        }
    };

    const handleSeekMouseMove = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const currentPos = duration ? currentTime / duration : 0;

        const visualThumbX = (currentPos * rect.width) + (8 - 16 * currentPos);
        const isHover = Math.abs(offsetX - visualThumbX) < 12;
        setHoverSeek(isHover);
    };

    const updateVolHoverState = useCallback((clientX) => {
        if (!volContainerRef.current) return;

        const rect = volContainerRef.current.getBoundingClientRect();
        const offsetX = clientX - rect.left;
        const currentPos = isMuted ? 0 : volume;

        const visualThumbX = (currentPos * rect.width) + (8 - 16 * currentPos);
        const isHover = Math.abs(offsetX - visualThumbX) < 12;
        setHoverVol(isHover);
    }, [isMuted, volume]);

    useEffect(() => {
        if (lastVolClientXRef.current !== null) {
            updateVolHoverState(lastVolClientXRef.current);
        }
    }, [volume, isMuted, updateVolHoverState]);

    const handleVolMouseMove = (e) => {
        lastVolClientXRef.current = e.clientX;
        updateVolHoverState(e.clientX);
    };

    const handleVolMouseLeave = () => {
        lastVolClientXRef.current = null;
        setHoverVol(false);
    };

    const toggleMute = () => {
        if (videoRef.current) {
            if (isMuted) {
                videoRef.current.muted = false;
                setIsMuted(false);
                if (volume === 0) {
                    let newVol = prevVolumeRef.current;
                    if (!newVol || newVol < 0.1) newVol = 0.5;
                    videoRef.current.volume = newVol;
                    setVolume(newVol);
                }
            } else {
                prevVolumeRef.current = volume;
                videoRef.current.muted = true;
                setIsMuted(true);
            }
        }
    };

    const handleVolumeChange = (newVol) => {
        setVolume(newVol);
        if (videoRef.current) {
            videoRef.current.volume = newVol;
            videoRef.current.muted = newVol === 0;
            setIsMuted(newVol === 0);
        }
    };

    const handleVolumeCommit = () => {
        const currentVol = videoRef.current ? videoRef.current.volume : volume;
        if (currentVol > 0) {
            prevVolumeRef.current = currentVol;
        }
    };

    const activateVolume = useCallback(() => {
        setIsVolumeActive(true);
        if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
        volumeTimeoutRef.current = setTimeout(() => setIsVolumeActive(false), 2000);
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    const handleDownload = useCallback(() => {
        // Fix: 'src' can be a Blob Object. If so, we must use 'localSrc' (the generated Object URL).
        // Priority:
        // 1. localSrc (Generated URL from passed Blob Object)
        // 2. blobUrl (Generated URL from IDB/Network Blob)
        // 3. src (If string and not http, likely local path? But less common here)
        // 4. streamingSrc (Remote URL)
        const targetUrl = localSrc || blobUrl || (typeof src === 'string' ? src : null) || streamingSrc;

        if (!targetUrl) {
            console.warn('[VideoPlayer] No download source available');
            return;
        }

        const link = document.createElement('a');
        link.href = targetUrl;
        link.download = fileName || 'video.mp4';
        link.target = '_blank';
        link.click();
    }, [localSrc, blobUrl, src, streamingSrc, fileName]);

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const handleVideoClick = (e) => {
        e.stopPropagation();
        togglePlay();
    };

    const controlsClass = `transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`;

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-center items-center"
            onMouseMove={resetHideTimeout}
            onClick={handleBackdropClick}
        >
            {/* Video Container */}
            <div className="relative w-full h-full flex items-center justify-center">
                {/* Loading Overlay with Close Button */}
                {isLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                        {/* Close button - always visible during download */}
                        <div className="absolute top-4 right-4">
                            <Tooltip delayDuration={0}>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={onClose}
                                        className="rounded-full bg-black/30 backdrop-blur-sm hover:bg-red-500/80 text-white"
                                    >
                                        <X className="w-5 h-5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Close (Esc)</TooltipContent>
                            </Tooltip>
                        </div>

                        <div className="relative">
                            {/* Circular Progress */}
                            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 100 100">
                                <circle
                                    cx="50"
                                    cy="50"
                                    r="40"
                                    fill="none"
                                    stroke="rgba(255,255,255,0.2)"
                                    strokeWidth="6"
                                />
                                <circle
                                    cx="50"
                                    cy="50"
                                    r="40"
                                    fill="none"
                                    stroke="white"
                                    strokeWidth="6"
                                    strokeLinecap="round"
                                    strokeDasharray={2 * Math.PI * 40}
                                    strokeDashoffset={2 * Math.PI * 40 * (1 - downloadProgress / 100)}
                                    className="transition-all duration-150"
                                />
                            </svg>
                            <Badge variant="secondary" className="absolute inset-0 flex items-center justify-center bg-transparent border-0 text-white text-lg font-medium">
                                {downloadProgress}%
                            </Badge>
                        </div>
                        <span className="text-white/70 text-sm mt-4">Mengunduh video...</span>
                    </div>
                )}

                {/* Video Element */}
                {!isLoading && videoSrc && (
                    <>
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                        <video
                            ref={videoRef}
                            src={videoSrc}
                            preload="metadata"
                            className="max-h-full max-w-full outline-none"
                            onClick={handleVideoClick}
                            onTimeUpdate={handleTimeUpdate}
                            onLoadedMetadata={handleLoadedMetadata}
                            onDurationChange={handleDurationChange}
                            onCanPlay={handleDurationChange}
                            onEnded={handleEnded}
                        />
                    </>
                )}
            </div>

            {/* Header Actions - wrapped with key to reset tooltips when hidden */}
            <TooltipProvider key={controlsVisible ? 'header-visible' : 'header-hidden'} delayDuration={0}>
                <div className={`absolute top-0 left-0 right-0 z-10 ${controlsClass}`}>
                    <div className="bg-gradient-to-b from-black/70 via-black/40 to-transparent p-4 flex items-center justify-between">
                        {/* Filename */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span
                                    ref={fileNameRef}
                                    className="text-white text-sm font-medium truncate drop-shadow-lg flex-1 max-w-[50%] min-w-0 mr-4 cursor-default"
                                >
                                    {fileName || 'Video'}
                                </span>
                            </TooltipTrigger>
                            {isTruncated && (
                                <TooltipContent side="bottom" align="start">
                                    {fileName || 'Video'}
                                </TooltipContent>
                            )}
                        </Tooltip>

                        <div className="flex items-center gap-2">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={handleDownload}
                                        className="rounded-full bg-black/30 backdrop-blur-sm hover:bg-white/20 text-white"
                                    >
                                        <Download className="w-5 h-5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Download</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={onClose}
                                        className="rounded-full bg-black/30 backdrop-blur-sm hover:bg-red-500/80 text-white"
                                    >
                                        <X className="w-5 h-5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Close (Esc)</TooltipContent>
                            </Tooltip>
                        </div>
                    </div>
                </div>
            </TooltipProvider>

            {/* Bottom Controls - wrapped with key to reset tooltips when hidden */}
            <TooltipProvider key={controlsVisible ? 'footer-visible' : 'footer-hidden'} delayDuration={0}>
                <div className={`absolute bottom-0 left-0 right-0 z-10 ${controlsClass}`}>
                    <div className="bg-gradient-to-t from-black/70 via-black/40 to-transparent p-4 pb-6 sm:px-6">
                        {/* Progress Bar */}
                        <div
                            className="group relative flex items-center w-full h-6 cursor-pointer"
                            onMouseMove={handleSeekMouseMove}
                            onMouseLeave={() => setHoverSeek(false)}
                        >
                            <input
                                type="range"
                                min={0}
                                max={duration}
                                step={0.001}
                                value={currentTime}
                                onChange={handleSeek}
                                onMouseDown={handleSeekStart}
                                onMouseUp={handleSeekEnd}
                                className="absolute z-10 w-full h-full opacity-0 cursor-pointer"
                            />
                            {/* Visual Track */}
                            <div className="w-full h-1 bg-white/30 rounded-full overflow-hidden pointer-events-none relative">
                                <motion.div
                                    className="h-full bg-white origin-left"
                                    style={{
                                        scaleX: duration > 0 ? currentTime / duration : 0
                                    }}
                                    transition={{ type: "tween", duration: 0.05, ease: "linear" }}
                                />
                            </div>

                            {/* Thumb Indicator */}
                            <motion.div
                                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                                style={{
                                    left: duration > 0
                                        ? `calc(${(currentTime / duration) * 100}% - ${(currentTime / duration) * 16}px)`
                                        : 0
                                }}
                                transition={{ type: "tween", duration: 0.05, ease: "linear" }}
                            >
                                <Badge variant="default" className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-opacity duration-200 ${hoverSeek || isDraggingSeek ? 'opacity-100' : 'opacity-0'}`}>
                                    {formatDuration(currentTime)}
                                </Badge>
                                <div className="w-full h-full bg-white rounded-full shadow-md flex items-center justify-center">
                                    <motion.div
                                        className="w-full h-full bg-violet-500 rounded-full"
                                        animate={{ scale: hoverSeek ? 0.75 : 0.5 }}
                                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                    />
                                </div>
                            </motion.div>
                        </div>

                        {/* Controls Row */}
                        <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-4">
                                {/* Play/Pause */}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={togglePlay}
                                            className="text-white hover:text-white/80 hover:bg-transparent"
                                        >
                                            {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{isPlaying ? 'Pause (Space)' : 'Play (Space)'}</TooltipContent>
                                </Tooltip>

                                {/* Volume */}
                                <div className="flex items-center gap-2 group/vol">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={toggleMute}
                                                className="text-white hover:text-white/80 hover:bg-transparent"
                                            >
                                                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{isMuted ? 'Unmute (M)' : 'Mute (M)'}</TooltipContent>
                                    </Tooltip>

                                    <div className={`overflow-hidden transition-all duration-300 flex items-center h-20 ${hoverVol || isVolumeActive ? 'w-24' : 'w-0 group-hover/vol:w-24'}`}>
                                        <div className="w-24 pl-2 shrink-0 h-full flex items-center">
                                            <div
                                                ref={volContainerRef}
                                                className="w-20 shrink-0 relative group/slider h-20 flex items-center cursor-pointer"
                                                onMouseMove={handleVolMouseMove}
                                                onMouseDown={(e) => { lastVolClientXRef.current = e.clientX; updateVolHoverState(e.clientX); }}
                                                onMouseLeave={handleVolMouseLeave}
                                            >
                                                {/* Invisible Input */}
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={1}
                                                    step={0.01}
                                                    value={isMuted ? 0 : volume}
                                                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                                                    onMouseUp={handleVolumeCommit}
                                                    onKeyUp={handleVolumeCommit}
                                                    className="absolute z-10 w-full h-full opacity-0 cursor-pointer"
                                                />
                                                {/* Visual Track */}
                                                <div className="w-full h-1 bg-white/30 rounded-full overflow-hidden pointer-events-none relative">
                                                    <div
                                                        className="h-full bg-white"
                                                        style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
                                                    />
                                                </div>

                                                {/* Thumb Indicator */}
                                                <div
                                                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 pointer-events-none"
                                                    style={{
                                                        left: `calc(${(isMuted ? 0 : volume) * 100}% + ${8 - 16 * (isMuted ? 0 : volume)}px)`
                                                    }}
                                                >
                                                    <Badge variant="default" className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-1.5 py-1 rounded-md text-xs whitespace-nowrap transition-opacity duration-200 ${hoverVol || isVolumeActive ? 'opacity-100' : 'opacity-0'}`}>
                                                        {Math.round((isMuted ? 0 : volume) * 100)}
                                                    </Badge>
                                                    <div className="w-full h-full bg-white rounded-full shadow-md flex items-center justify-center">
                                                        <div className={`w-full h-full bg-violet-500 rounded-full transition-transform duration-300 ease-out ${hoverVol || isVolumeActive ? 'scale-75' : 'scale-50'}`} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Time Display */}
                                <Badge variant="secondary" className="text-xs text-white/90 font-medium tabular-nums select-none bg-transparent border-0">
                                    {formatDuration(currentTime)} / {formatDuration(duration)}
                                </Badge>
                            </div>

                            <div className="flex items-center gap-2">
                                {/* Fullscreen */}
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={toggleFullscreen}
                                            className="text-white hover:text-white/80 hover:bg-transparent"
                                        >
                                            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}</TooltipContent>
                                </Tooltip>
                            </div>
                        </div>
                    </div>
                </div>
            </TooltipProvider>
        </div>
    );
});

VideoPlayer.displayName = 'VideoPlayer';

export default VideoPlayer;
