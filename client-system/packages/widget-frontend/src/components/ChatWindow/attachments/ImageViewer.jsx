/**
 * ImageViewer Component
 *
 * Full-screen image viewer with zoom, rotate, and download capabilities.
 * Accepts blob data from ImageAttachment to avoid re-downloading.
 */

import { Debouncer } from '@tanstack/pacer'; // Import Debouncer
import { Download, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useObjectUrl } from '@/hooks/useObjectUrl';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const ImageViewer = memo(
  ({
    src, // Direct URL (fallback)
    blob, // Blob data from ImageAttachment (preferred)
    fullUrl, // Full URL for download
    alt,
    fileName,
    onClose,
  }) => {
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [isTruncated, setIsTruncated] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const containerRef = useRef(null);
    const imgRef = useRef(null);
    const fileNameRef = useRef(null);
    const hideControlsDebouncer = useRef(null);

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

    const resetHideTimeout = useCallback(() => {
      setControlsVisible(true);
      // Reschedule hide
      hideControlsDebouncer.current?.maybeExecute();
    }, []);

    useEffect(() => {
      resetHideTimeout();
      // Cleanup handled by debouncer ref cleanup in parent effect
    }, [resetHideTimeout]);

    const handleImageClick = useCallback(
      (e) => {
        e.stopPropagation();
        if (controlsVisible) {
          setControlsVisible(false);
          hideControlsDebouncer.current?.cancel();
        } else {
          resetHideTimeout();
        }
      },
      [controlsVisible, resetHideTimeout],
    );

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

    // Use blob URL if blob is provided
    const managedBlobUrl = useObjectUrl(blob);

    // Determine display source: STRICTLY use managedBlobUrl (Download First Pattern)
    // Do NOT fall back to 'src' (remote URL) to prevent double-fetch.
    // If blob is missing, we shouldn't be here (or show loader - but for viewer we expect data).
    // Exception: If src is a data URI or blob URI passed directly (optimistic), use it.
    // Exception 2: If blob is loading (null) but we have a src (remote), allow it so user can view while downloading.
    const displaySrc = managedBlobUrl || src;

    // URL for download: prefer fullUrl, then src
    const downloadUrl = fullUrl || src || '';

    const updateZoom = useCallback(
      (newZoom) => {
        const waitingZoom = typeof newZoom === 'function' ? newZoom(zoom) : newZoom;
        setZoom(clamp(waitingZoom, 0.25, 5));
        setPosition({ x: 0, y: 0 });
      },
      [zoom],
    );

    const handleReset = useCallback(() => {
      setZoom(1);
      setPosition({ x: 0, y: 0 });
      // Smart reset: rotate to the nearest multiple of 360 to avoid spinning effect
      setRotation((prev) => Math.round(prev / 360) * 360);
    }, []);

    const handleDownload = useCallback(() => {
      // If we have a blob, create a download from it
      if (blob) {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName || 'image';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        return;
      }

      // Fallback: use URL directly
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName || 'image';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }, [blob, downloadUrl, fileName]);

    const handleBackdropClick = useCallback(
      (e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      },
      [onClose],
    );

    // Drag handling
    useEffect(() => {
      if (!isDragging) return;
      const handleMouseMove = (e) => {
        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;
        setPosition((prev) => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
        dragStartRef.current = { x: e.clientX, y: e.clientY };
      };
      const handleMouseUp = () => setIsDragging(false);
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }, [isDragging]);

    const handleMouseDown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    };

    // Keyboard support
    useEffect(() => {
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === '+' || e.key === '=') updateZoom((z) => z + 0.25);
        if (e.key === '-') updateZoom((z) => z - 0.25);
        if (e.key === 'r' || e.key === 'R') setRotation((r) => r + 90);
        if (e.key === '0') handleReset();
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose, updateZoom, handleReset]);

    const controlsClass = `transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`;

    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: Backdrop click handler
      <div
        role="presentation"
        ref={containerRef}
        className="fixed inset-0 z-[100] bg-black/95"
        onClick={handleBackdropClick}
        onMouseMove={resetHideTimeout}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          <img
            ref={imgRef}
            src={displaySrc}
            alt={alt || 'Image'}
            className={`max-w-none select-none transition-transform duration-200 ease-out ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              maxWidth: '100vw',
              maxHeight: '100vh',
              objectFit: 'contain',
            }}
            draggable={false}
            onMouseDown={handleMouseDown}
            onClick={handleImageClick}
          />
        </div>

        {/* Header Controls */}
        <TooltipProvider key={controlsVisible ? 'visible' : 'hidden'} delayDuration={0}>
          <div className={`absolute top-0 right-0 left-0 z-10 ${controlsClass}`}>
            <div className="flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4">
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <span
                    ref={fileNameRef}
                    className="mr-4 flex-1 truncate font-medium text-sm text-white drop-shadow-md"
                  >
                    {fileName || 'Image'}
                  </span>
                </TooltipTrigger>
                {isTruncated && (
                  <TooltipContent side="bottom" align="start">
                    {fileName || 'Image'}
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
                      className="h-10 w-10 rounded-full text-white hover:bg-white/20"
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
                      className="h-10 w-10 rounded-full text-white hover:bg-red-500/80"
                    >
                      <X className="h-6 w-6" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Close (Esc)</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

          {/* Footer Controls */}
          <div
            className={`absolute right-0 bottom-0 left-0 z-10 ${controlsClass} pointer-events-none flex justify-center bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-12 pb-6`}
          >
            <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-4 py-2 shadow-xl backdrop-blur-md">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => updateZoom((z) => z - 0.25)}
                    className="h-9 w-9 rounded-full text-white hover:bg-white/20"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Zoom Out (-)</TooltipContent>
              </Tooltip>

              <Button
                variant="ghost"
                onClick={handleReset}
                className="min-w-[3rem] px-2 font-medium text-white text-xs tabular-nums hover:bg-white/20"
              >
                {Math.round(zoom * 100)}%
              </Button>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => updateZoom((z) => z + 0.25)}
                    className="h-9 w-9 rounded-full text-white hover:bg-white/20"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Zoom In (+)</TooltipContent>
              </Tooltip>

              <Separator orientation="vertical" className="mx-1 h-5 bg-white/20" />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setRotation((r) => r + 90)}
                    className="h-9 w-9 rounded-full text-white hover:bg-white/20"
                  >
                    <RotateCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Rotate (R)</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </TooltipProvider>
      </div>
    );
  },
);

export default ImageViewer;
