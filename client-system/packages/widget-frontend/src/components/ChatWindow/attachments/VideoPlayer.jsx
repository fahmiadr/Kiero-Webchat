import { Debouncer } from '@tanstack/pacer'; // Import Debouncer
import { Download, Maximize, Minimize, Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CircularProgress } from '@/components/ui/circular-progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAttachment } from '@/hooks/useAttachment';
import useAttachmentProgressStore from '@/stores/useAttachmentProgressStore';
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
const VideoPlayer = memo(({ src, streamingSrc, fileName, onClose, backendUrl, clientId }) => {
  // Determine effective source key (prioritize streamingSrc if available)
  const effectiveKey = streamingSrc || src;

  // Use TanStack Query Hook
  // Default enabled: true (we want to load the video immediately when player opens)
  const { data: videoBlob, isLoading: isQueryLoading } = useAttachment(effectiveKey, {
    enabled: true,
    backendUrl,
    clientId,
  });

  // Get Download Progress from Store
  const downloadProgress = useAttachmentProgressStore(
    (state) => state.downloadProgress[effectiveKey] || 0,
  );

  // Create Blob URL
  // We memoize this to prevent flickering
  const blobUrl = useMemo(() => (videoBlob ? URL.createObjectURL(videoBlob) : null), [videoBlob]);

  // Cleanup Blob URL
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  // Use Blob URL if available, otherwise fallback to src (if not blob:), but really we wait for download usually?
  // If we have streamingSrc (remote), and no blob yet -> we are downloading.
  // If we have src (local/blob), we can use it directly?

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

  // We intentionally EXCLUDE streamingSrc from the initial videoSrc determination.
  // This forces the "isLoading" state (and thus the progress circle) to appear while the blob is downloading.
  // streamingSrc is used as a LAST RESORT fallback only if loading finishes without a blob (e.g. error).

  // FIX: Only treat as "resolved" if it's a blob/data URI.
  // Relative paths (starts with /) are remote and should trigger loading.
  const resolvedBlobSrc =
    localSrc ||
    blobUrl ||
    (typeof src === 'string' && (src.startsWith('blob:') || src.startsWith('data:')) ? src : null);

  // Loading state: If no resolved blob (and we are fetching remote)
  // This ensures we show the progress bar while downloading
  const isLoading = !resolvedBlobSrc && isQueryLoading;

  // Final Playable Source:
  // If we have a blob, use it.
  // If we are NOT loading and have no blob, try streamingSrc (fallback/error case).
  const videoSrc = resolvedBlobSrc || (isLoading ? null : streamingSrc || src);

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
  const hideControlsDebouncer = useRef(null);
  const volumeTimeoutRef = useRef(null);
  const wasPlayingRef = useRef(false);
  const animationFrameRef = useRef(null);

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

  // Initialize Debouncer for auto-hiding controls
  useEffect(() => {
    hideControlsDebouncer.current = new Debouncer(
      () => {
        setControlsVisible(false);
      },
      { wait: 3000 },
    );

    return () => {
      hideControlsDebouncer.current?.cancel();
    };
  }, []);

  // Reset hide timeout on mouse movement
  const resetHideTimeout = useCallback(() => {
    setControlsVisible(true);
    // Cancel pending hide
    hideControlsDebouncer.current?.cancel();

    if (!isPlaying) return;

    // Schedule new hide
    hideControlsDebouncer.current?.maybeExecute();
  }, [isPlaying]);

  useEffect(() => {
    resetHideTimeout();
    // Cleanup handled by debouncer ref cleanup in parent effect
  }, [resetHideTimeout]);

  // Keyboard shortcuts moved below to avoid hoisting issues

  // Robust Duration Check
  useEffect(() => {
    if (videoRef.current?.duration && !Number.isNaN(videoRef.current.duration)) {
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
      videoRef.current.play().catch(() => {});
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

    const visualThumbX = currentPos * rect.width + (8 - 16 * currentPos);
    const isHover = Math.abs(offsetX - visualThumbX) < 12;
    setHoverSeek(isHover);
  };

  const updateVolHoverState = useCallback(
    (clientX) => {
      if (!volContainerRef.current) return;

      const rect = volContainerRef.current.getBoundingClientRect();
      const offsetX = clientX - rect.left;
      const currentPos = isMuted ? 0 : volume;

      const visualThumbX = currentPos * rect.width + (8 - 16 * currentPos);
      const isHover = Math.abs(offsetX - visualThumbX) < 12;
      setHoverVol(isHover);
    },
    [isMuted, volume],
  );

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

  const toggleMute = useCallback(() => {
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
  }, [isMuted, volume]);

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

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    } else {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      resetHideTimeout();
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
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
        case 'm':
          toggleMute();
          break;
        case 'f':
          toggleFullscreen();
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    onClose,
    resetHideTimeout,
    volume,
    duration,
    toggleFullscreen,
    toggleMute,
    activateVolume,
    togglePlay,
  ]);

  const handleDownload = useCallback(() => {
    // Fix: 'src' can be a Blob Object. If so, we must use 'localSrc' (the generated Object URL).
    const targetUrl = localSrc || blobUrl || (typeof src === 'string' ? src : null) || streamingSrc;

    if (!targetUrl) {
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
    // biome-ignore lint/a11y/noStaticElementInteractions: Backdrop click handler
    <div
      role="presentation"
      ref={containerRef}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95"
      onMouseMove={resetHideTimeout}
      onClick={handleBackdropClick}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      {/* Video Container */}
      <div className="relative flex h-full w-full items-center justify-center">
        {/* Loading Overlay with Close Button */}
        {isLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
            {/* Close button - always visible during download */}
            <div className="absolute top-4 right-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="rounded-full bg-black/30 text-white backdrop-blur-sm hover:bg-red-500/80"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Close (Esc)</TooltipContent>
              </Tooltip>
            </div>

            <div className="flex flex-col items-center gap-4">
              {/* Non-interactive Circular Progress */}
              <div
                className="relative flex items-center justify-center border-0 bg-transparent p-0"
                style={{ width: '80px', height: '80px' }}
              >
                <CircularProgress percentage={downloadProgress} size={80} strokeWidth={6} />
                {/* Percentage in center */}
                <span className="absolute font-medium text-lg text-white">{downloadProgress}%</span>
              </div>
              <span className="mt-4 text-sm text-white/70">Mengunduh video...</span>
            </div>
          </div>
        )}

        {/* Video Element */}
        {!isLoading && videoSrc && (
          <>
            {/* biome-ignore lint/a11y/useMediaCaption: User-uploaded videos do not have distinct caption tracks */}
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
        <div className={`absolute top-0 right-0 left-0 z-10 ${controlsClass}`}>
          <div className="flex items-center justify-between bg-gradient-to-b from-black/70 via-black/40 to-transparent p-4">
            {/* Filename */}
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <span
                  ref={fileNameRef}
                  className="mr-4 min-w-0 max-w-[50%] flex-1 truncate font-medium text-sm text-white drop-shadow-lg"
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
                    className="rounded-full bg-black/30 text-white backdrop-blur-sm hover:bg-white/20"
                  >
                    <Download className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Download</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="rounded-full bg-black/30 text-white backdrop-blur-sm hover:bg-red-500/80"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Close (Esc)</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </TooltipProvider>

      {/* Bottom Controls - wrapped with key to reset tooltips when hidden */}
      <TooltipProvider key={controlsVisible ? 'footer-visible' : 'footer-hidden'} delayDuration={0}>
        <div className={`absolute right-0 bottom-0 left-0 z-10 ${controlsClass}`}>
          <div className="bg-gradient-to-t from-black/70 via-black/40 to-transparent p-4 pb-6 sm:px-6">
            {/* Progress Bar */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: Handled by nested range input */}
            <div
              className="group relative flex h-6 w-full cursor-pointer items-center"
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
                className="absolute z-10 h-full w-full cursor-pointer opacity-0"
              />
              {/* Visual Track */}
              <div className="pointer-events-none relative h-1 w-full overflow-hidden rounded-full bg-white/30">
                <div
                  className="h-full origin-left bg-white ease-linear"
                  style={{
                    transform: `scaleX(${duration > 0 ? currentTime / duration : 0})`,
                  }}
                />
              </div>

              {/* Thumb Indicator */}
              <div
                className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 ease-linear"
                style={{
                  left:
                    duration > 0
                      ? `calc(${(currentTime / duration) * 100}% - ${(currentTime / duration) * 16}px)`
                      : 0,
                }}
              >
                <Badge
                  variant="default"
                  className={`absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/90 px-3 py-1.5 text-white text-xs transition-opacity duration-200 ${hoverSeek || isDraggingSeek ? 'opacity-100' : 'opacity-0'}`}
                >
                  {formatDuration(currentTime)}
                </Badge>
                <div className="flex h-full w-full items-center justify-center rounded-full bg-white shadow-md">
                  <div
                    className={`h-full w-full rounded-full bg-violet-500 transition-transform duration-300 ${hoverSeek ? 'scale-75' : 'scale-50'}`}
                  />
                </div>
              </div>
            </div>

            {/* Controls Row */}
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Play/Pause */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={togglePlay}
                      className="text-white hover:bg-transparent hover:text-white/80"
                    >
                      {isPlaying ? (
                        <Pause className="h-6 w-6 fill-current" />
                      ) : (
                        <Play className="h-6 w-6 fill-current" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isPlaying ? 'Pause (Space)' : 'Play (Space)'}</TooltipContent>
                </Tooltip>

                {/* Volume */}
                <div className="group/vol flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleMute}
                        className="text-white hover:bg-transparent hover:text-white/80"
                      >
                        {isMuted || volume === 0 ? (
                          <VolumeX className="h-5 w-5" />
                        ) : (
                          <Volume2 className="h-5 w-5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{isMuted ? 'Unmute (M)' : 'Mute (M)'}</TooltipContent>
                  </Tooltip>

                  <div
                    className={`flex h-20 items-center overflow-hidden transition-all duration-300 ${hoverVol || isVolumeActive ? 'w-24' : 'w-0 group-hover/vol:w-24'}`}
                  >
                    <div className="flex h-full w-24 shrink-0 items-center pl-2">
                      {/* biome-ignore lint/a11y/noStaticElementInteractions: Handled by nested range input */}
                      <div
                        role="presentation"
                        ref={volContainerRef}
                        className="group/slider relative flex h-20 w-20 shrink-0 cursor-pointer items-center"
                        onMouseMove={handleVolMouseMove}
                        onMouseDown={(e) => {
                          lastVolClientXRef.current = e.clientX;
                          updateVolHoverState(e.clientX);
                        }}
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
                          className="absolute z-10 h-full w-full cursor-pointer opacity-0"
                        />
                        {/* Visual Track */}
                        <div className="pointer-events-none relative h-1 w-full overflow-hidden rounded-full bg-white/30">
                          <div
                            className="h-full bg-white"
                            style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
                          />
                        </div>

                        {/* Thumb Indicator */}
                        <div
                          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2"
                          style={{
                            left: `calc(${(isMuted ? 0 : volume) * 100}% + ${8 - 16 * (isMuted ? 0 : volume)}px)`,
                          }}
                        >
                          <Badge
                            variant="default"
                            className={`absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/90 px-1.5 py-1 text-white text-xs transition-opacity duration-200 ${hoverVol || isVolumeActive ? 'opacity-100' : 'opacity-0'}`}
                          >
                            {Math.round((isMuted ? 0 : volume) * 100)}
                          </Badge>
                          <div className="flex h-full w-full items-center justify-center rounded-full bg-white shadow-md">
                            <div
                              className={`h-full w-full rounded-full bg-violet-500 transition-transform duration-300 ease-out ${hoverVol || isVolumeActive ? 'scale-75' : 'scale-50'}`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Time Display */}
                <Badge
                  variant="secondary"
                  className="select-none border-0 bg-transparent font-medium text-white/90 text-xs tabular-nums"
                >
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
                      className="text-white hover:bg-transparent hover:text-white/80"
                    >
                      {isFullscreen ? (
                        <Minimize className="h-5 w-5" />
                      ) : (
                        <Maximize className="h-5 w-5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>
      </TooltipProvider>
    </div>
  );
});

export default VideoPlayer;
