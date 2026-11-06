import { Download, Music, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAttachment } from '@/hooks/useAttachment';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import useAttachmentProgressStore from '@/stores/useAttachmentProgressStore';
import { cn } from '@/utils/cn';
import { formatBytes, formatDuration } from '@/utils/formatUtils';
import { MEDIA_LAYOUT } from '@/utils/mediaLayoutUtils';
import DownloadStatusControls from './DownloadStatusControls';

const ControlButton = memo(({ onClick, icon: _Icon, label, className = '', iconClass = '' }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        onClick={onClick}
        className={cn('flex items-center justify-center transition-all duration-200', className)}
      >
        <_Icon className={iconClass} />
      </Button>
    </TooltipTrigger>
    {label && <TooltipContent>{label}</TooltipContent>}
  </Tooltip>
));

// ==========================================
// 2. AudioPlayerUI (Inner Component - High Frequency Updates)
// ==========================================
// This component handles playback state, time updates, and rendering.
// It receives STABLE props from the container (blobUrl, styles, etc.)
// removing the overhead of hooks checking on every frame.

const AudioPlayerUI = memo(
  ({
    src, // activeSource (blobUrl or remote)
    fileName,
    className,
    styles,
    status, // 'idle', 'downloading', 'error', 'downloaded'
    progress,
    fileSize,
    propDuration,
    onPlayRequest,
    onCancelDownload,
    onRetry,
    onSaveFile,
  }) => {
    const audioRef = useRef(null);
    const progressRef = useRef(null);

    // Internal Playback State
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(propDuration || 0);
    const [isMuted, setIsMuted] = useState(false);

    // Drag/Hover State
    const [hoverSeek, setHoverSeek] = useState(false);
    const [isDraggingSeek, setIsDraggingSeek] = useState(false);
    const [shouldAutoPlay, setShouldAutoPlay] = useState(false);

    // Sync duration from prop if provided
    useEffect(() => {
      if (propDuration && duration === 0) setDuration(propDuration);
    }, [propDuration, duration]);

    // Auto-play logic
    // We check if src is ready (blobUrl present for downloaded)
    const isReady =
      status === 'downloaded' || (src && status !== 'downloading' && status !== 'error');

    useEffect(() => {
      if (shouldAutoPlay && isReady && audioRef.current) {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
              setShouldAutoPlay(false);
            })
            .catch(() => setShouldAutoPlay(false));
        }
      }
    }, [shouldAutoPlay, isReady, src]); // src change might trigger readiness

    // Handlers
    const togglePlay = useCallback(() => {
      if (!isReady) {
        // Request download/load
        setShouldAutoPlay(true);
        onPlayRequest();
        return;
      }

      const audioEl = audioRef.current;
      if (!audioEl) return;

      if (isPlaying) {
        audioEl.pause();
      } else {
        // Defensive check: Ensure src exists and isn't empty before playing
        if (!audioEl.src || audioEl.currentSrc === '') {
          return;
        }

        setShouldAutoPlay(true);

        // Handle promise rejection for play()
        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
          playPromise.catch((_error) => {
            setIsPlaying(false);
            setShouldAutoPlay(false);
          });
        }
      }
    }, [isReady, isPlaying, onPlayRequest]);

    const handleTimeUpdate = useCallback(() => {
      if (!isDraggingSeek && audioRef.current) setCurrentTime(audioRef.current.currentTime);
    }, [isDraggingSeek]);

    const handleLoadedMetadata = useCallback(() => {
      if (audioRef.current?.duration) setDuration(audioRef.current.duration);
    }, []);

    const handleEnded = useCallback(() => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (audioRef.current) audioRef.current.currentTime = 0;
    }, []);

    const handleSeek = useCallback(
      (e) => {
        if (!duration) return;
        const newTime = parseFloat(e.target.value);
        setCurrentTime(newTime);
      },
      [duration],
    );

    const handleSeekEnd = useCallback(() => {
      setIsDraggingSeek(false);
      if (audioRef.current) {
        audioRef.current.currentTime = currentTime;
      }
    }, [currentTime]);

    const toggleMute = useCallback(() => {
      if (audioRef.current) {
        audioRef.current.muted = !isMuted;
        setIsMuted(!isMuted);
      }
    }, [isMuted]);

    // Render NOT READY (Card View)
    if (!isReady) {
      return (
        <div
          style={{ width: '100%', maxWidth: `${MEDIA_LAYOUT.MAX_WIDTH}px` }}
          className={`rounded-xl ${className}`}
        >
          <div className="flex items-center gap-3 p-3">
            {/* Left: Music icon — always visible */}
            <div
              className={cn(
                'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full',
                styles.bg,
              )}
            >
              <Music className={cn('h-5 w-5', styles.text)} />
            </div>

            {/* Center: File info */}
            <div className="min-w-0 flex-1">
              <p className={cn('truncate font-medium text-xs', styles.text.replace('/80', ''))}>
                {fileName || 'Audio'}
              </p>
              <div className={cn('flex items-center gap-2 text-[10px]', styles.text)}>
                {duration > 0 && <span>{formatDuration(duration)}</span>}
                {duration > 0 && fileSize && <span>•</span>}
                {fileSize && <span>{formatBytes(fileSize)}</span>}
              </div>
            </div>

            {/* Right: Action controls */}
            {status === 'idle' && (
              <ControlButton
                onClick={togglePlay}
                icon={Play}
                label="Unduh Audio"
                className={cn(
                  'h-8 w-8 rounded-full border-0 hover:scale-105 active:scale-95',
                  styles.button,
                )}
                iconClass="w-4 h-4 ml-0.5 fill-current"
              />
            )}

            <DownloadStatusControls
              status={status}
              progress={progress}
              onCancel={onCancelDownload}
              onResume={togglePlay}
              onRetry={onRetry}
              size="md"
              variant="inline"
              progressColors={styles.progressColors}
              iconColor={styles.text}
            />
          </div>
        </div>
      );
    }

    // Render READY (Full Player)
    return (
      <div
        style={{ width: '100%', maxWidth: `${MEDIA_LAYOUT.MAX_WIDTH}px` }}
        className={`rounded-xl ${className}`}
      >
        {/* biome-ignore lint/a11y/useMediaCaption: User uploaded content lacks captions */}
        <audio
          ref={audioRef}
          src={src}
          preload="none"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />

        <div className="flex items-center gap-1 px-2 py-1.5">
          <ControlButton
            onClick={togglePlay}
            icon={isPlaying ? Pause : Play}
            label={isPlaying ? 'Jeda' : 'Putar'}
            className={cn(
              'h-8 w-8 rounded-full border-0 hover:scale-105 active:scale-95',
              styles.button,
            )}
            iconClass={cn('fill-current', isPlaying ? 'w-4 h-4' : 'w-4 h-4 ml-0.5')}
          />

          {/* biome-ignore lint/a11y/noStaticElementInteractions: handled by nested range input */}
          <div
            ref={progressRef}
            className="group relative flex h-5 min-w-0 flex-1 cursor-pointer items-center"
            onMouseMove={() => setHoverSeek(true)}
            onMouseLeave={() => setHoverSeek(false)}
            onFocus={() => setHoverSeek(true)}
            onBlur={() => setHoverSeek(false)}
          >
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.01}
              value={currentTime}
              onChange={handleSeek}
              onMouseDown={() => setIsDraggingSeek(true)}
              onMouseUp={handleSeekEnd}
              onTouchStart={() => setIsDraggingSeek(true)}
              onTouchEnd={handleSeekEnd}
              className="absolute z-10 h-full w-full cursor-pointer opacity-0"
            />
            <div
              className={cn(
                'pointer-events-none h-1 w-full overflow-hidden rounded-full',
                styles.track,
              )}
            >
              <div
                className={cn(
                  'h-full origin-left',
                  !isDraggingSeek && 'transition-transform duration-75 ease-linear',
                  styles.fill,
                )}
                style={{ transform: `scaleX(${duration > 0 ? currentTime / duration : 0})` }}
              />
            </div>
            <div
              className={cn(
                'pointer-events-none absolute top-1/2 h-3 w-3 -translate-y-1/2',
                !isDraggingSeek && 'transition-[left] duration-75 ease-linear',
              )}
              style={{
                left:
                  duration > 0
                    ? `calc(${(currentTime / duration) * 100}% - ${(currentTime / duration) * 12}px)`
                    : 0,
              }}
            >
              <div className="flex h-full w-full items-center justify-center rounded-full bg-white shadow-md">
                <div
                  className={cn(
                    'h-full w-full rounded-full transition-transform duration-100',
                    styles.thumb,
                    hoverSeek || isDraggingSeek ? 'scale-75' : 'scale-50',
                  )}
                />
              </div>
            </div>
          </div>

          <span
            className={cn(
              'min-w-[65px] flex-shrink-0 text-right font-mono text-[11px]',
              styles.text,
            )}
          >
            {formatDuration(currentTime)}/{formatDuration(duration)}
          </span>

          <ControlButton
            onClick={toggleMute}
            icon={isMuted ? VolumeX : Volume2}
            label={isMuted ? 'Aktifkan suara' : 'Bisukan'}
            className="h-7 w-7 rounded-md transition-all hover:bg-black/10 hover:shadow-sm dark:hover:bg-white/10"
            iconClass={cn('w-4 h-4', styles.text)}
          />

          <ControlButton
            onClick={onSaveFile}
            icon={Download}
            label="Simpan audio"
            className="h-7 w-7 rounded-md transition-all hover:bg-black/10 hover:shadow-sm dark:hover:bg-white/10"
            iconClass={cn('w-4 h-4', styles.text)}
          />
        </div>

        <div className="-mt-0.5 flex items-center gap-1.5 px-2.5 pb-1.5">
          <Music className={cn('h-2.5 w-2.5 flex-shrink-0', styles.text)} />
          <span className={cn('truncate text-[10px]', styles.text)}>{fileName || 'Audio'}</span>
        </div>
      </div>
    );
  },
);

// ==========================================
// 3. AudioPlayer (Container Component)
// ==========================================
// Manages Data Fetching, Global State, and Lifecycle.
// Passes stable props to AudioPlayerUI.

const AudioPlayer = memo(function AudioPlayer({
  src,
  fileName,
  className = '',
  fileSize: propFileSize,
  duration: propDuration,
  onResize,
  backendUrl = '',
  clientId,
  playerStyles,
}) {
  // Default styles
  const styles = useMemo(
    () =>
      playerStyles || {
        bg: 'bg-slate-200/50',
        button: 'bg-slate-200 hover:bg-slate-300 text-slate-700',
        track: 'bg-slate-200',
        fill: 'bg-slate-500',
        thumb: 'bg-slate-500',
        text: 'text-slate-600',
        progress: '#64748b', // default slate
      },
    [playerStyles],
  );

  const [isEnabled, setIsEnabled] = useState(false);

  // Data Hooks
  const {
    data: audioBlob,
    isLoading,
    isError,
    refetch,
    cancel,
  } = useAttachment(src, {
    enabled: isEnabled,
    backendUrl,
    clientId,
  });

  const downloadProgress = useAttachmentProgressStore((s) => s.getProgress(src, 'download') || 0);
  const blobUrl = useObjectUrl(audioBlob);

  // Derived State
  let status = 'idle';
  if (isLoading && isEnabled) status = 'downloading';
  else if (isError) status = 'error';
  else if (audioBlob && !isLoading) status = 'downloaded';
  else if (!isEnabled && downloadProgress > 0 && !audioBlob) status = 'paused';

  const isBlobSrc = src?.startsWith('blob:');
  const activeSource = isBlobSrc ? src : blobUrl;

  const reportedRef = useRef(false);

  // Callbacks
  const handleRef = useCallback(
    (node) => {
      if (node && onResize && !reportedRef.current) {
        onResize(MEDIA_LAYOUT.MAX_WIDTH);
        reportedRef.current = true;
      }
    },
    [onResize],
  );

  const handlePlayRequest = useCallback(() => {
    setIsEnabled(true);
  }, []);

  const handleCancelDownload = useCallback(
    (e) => {
      if (e) e.stopPropagation();
      setIsEnabled(false);
      cancel();
    },
    [cancel],
  );

  const handleRetry = useCallback(() => {
    setIsEnabled(true);
    refetch();
  }, [refetch]);

  const handleSaveFile = useCallback(() => {
    if (audioBlob) {
      const saveUrl = URL.createObjectURL(audioBlob);
      const link = document.createElement('a');
      link.href = saveUrl;
      link.download = fileName || 'audio';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(saveUrl), 100);
      return;
    }
    if (!src) return;
    const link = document.createElement('a');
    link.href = src;
    link.download = fileName || 'audio';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [audioBlob, fileName, src]);

  // Render Delegate
  return (
    <div ref={handleRef} className="w-full">
      <AudioPlayerUI
        src={activeSource}
        fileName={fileName}
        className={className}
        styles={styles}
        status={status}
        progress={downloadProgress}
        fileSize={propFileSize}
        propDuration={propDuration}
        onPlayRequest={handlePlayRequest}
        onCancelDownload={handleCancelDownload}
        onRetry={handleRetry}
        onSaveFile={handleSaveFile}
      />
    </div>
  );
});

export default AudioPlayer;
