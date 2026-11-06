import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { useAttachment } from '@/hooks/useAttachment';
import { X, Download, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";


const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

import { useObjectUrl } from '@/hooks/useObjectUrl';

/**
 * ImageViewer Component (Industry-Standard Lightbox)
 * 
 * Features:
 * - Fullscreen image display (behind transparent controls)
 * - Auto-hiding header/footer on mouse inactivity (3s timeout)
 * - Zoom controls with scroll wheel support
 * - Rotate functionality
 * - Download button
 * - Keyboard navigation (Esc, +/-, R)
 * - Click outside to close
 * - Pan/drag when zoomed
 * 
 * @param {Object} props
 * @param {string} props.src - Image source URL
 * @param {string} props.alt - Image alt text
 * @param {string} props.fileName - Original filename for download
 * @param {Function} props.onClose - Close handler
 */
const ImageViewer = memo(({ src, alt, fileName, onClose }) => {
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [isTruncated, setIsTruncated] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const hideTimeoutRef = useRef(null);
    const containerRef = useRef(null);
    const imgRef = useRef(null);
    const fileNameRef = useRef(null);

    const { data: imageBlob, isLoading } = useAttachment(src);
    const blobUrl = useObjectUrl(imageBlob);

    // Effective Source logic:
    // 1. Blob URL (if ready)
    // 2. Original Src (only if not loading AND we found no blob)
    // This prevents browser from fetching 'src' if we have a blob but the URL isn't generated yet (useEffect delay).
    const effectiveSrc = blobUrl || ((!imageBlob && !isLoading) ? src : null);

    // Get current bounds for dragging
    // Calculate drag bounds based on current zoom/rotation
    const calculateBounds = useCallback((currentZoom, currentRotation) => {
        if (!imgRef.current) return { maxX: 0, maxY: 0 };
        const { offsetWidth, offsetHeight } = imgRef.current;
        const isRotated = Math.abs(currentRotation % 180) === 90;

        const currentWidth = (isRotated ? offsetHeight : offsetWidth) * currentZoom;
        const currentHeight = (isRotated ? offsetWidth : offsetHeight) * currentZoom;

        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const maxX = Math.max(0, (currentWidth - vw) / 2);
        const maxY = Math.max(0, (currentHeight - vh) / 2);

        return { maxX, maxY };
    }, []);

    const getBounds = useCallback(() => calculateBounds(zoom, rotation), [zoom, rotation, calculateBounds]);

    // Helper: Clamp position based on potential new state
    const getClampedPosition = useCallback((newPos, newZoom, newRotation) => {
        const { maxX, maxY } = calculateBounds(newZoom, newRotation);
        return {
            x: clamp(newPos.x, -maxX, maxX),
            y: clamp(newPos.y, -maxY, maxY)
        };
    }, [calculateBounds]);

    // Check truncation on title load
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
    }, [fileName, alt]);


    // Updated State Handlers (Sync position immediately, no useEffect)
    const updateZoom = useCallback((newZoom) => {
        const waitingZoom = typeof newZoom === 'function' ? newZoom(zoom) : newZoom;
        const finalZoom = clamp(waitingZoom, 0.25, 5); // Ensure limits
        setZoom(finalZoom);

        // Clamp position to new bounds immediately
        setPosition(prev => getClampedPosition(prev, finalZoom, rotation));
    }, [zoom, rotation, getClampedPosition]);

    const updateRotation = useCallback((newRotation) => {
        const waitingRot = typeof newRotation === 'function' ? newRotation(rotation) : newRotation;
        setRotation(waitingRot);

        // Clamp position to new bounds immediately
        setPosition(prev => getClampedPosition(prev, zoom, waitingRot));
    }, [zoom, rotation, getClampedPosition]);

    // Helper: Start/Restart the hide timer
    const startHideTimer = useCallback(() => {
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
        }
        hideTimeoutRef.current = setTimeout(() => {
            setControlsVisible(false);
        }, 3000);
    }, []);

    // Reset hide timeout on mouse movement (shows controls + restarts timer)
    const resetHideTimeout = useCallback(() => {
        setControlsVisible(true);
        startHideTimer();
    }, [startHideTimer]);

    // Initialize hide timeout and cleanup
    useEffect(() => {
        startHideTimer();

        return () => {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
        };
    }, [startHideTimer]);

    // Handle keyboard events
    useEffect(() => {
        const handleKeyDown = (e) => {
            resetHideTimeout();

            switch (e.key) {
                case 'Escape':
                    onClose();
                    break;
                case '+':
                case '=':
                    setZoom(z => Math.min(z + 0.25, 5));
                    break;
                case '-':
                case '_':
                    setZoom(z => Math.max(z - 0.25, 0.25));
                    break;
                case 'r':
                case 'R':
                    setRotation(r => r + 90);
                    break;
                case '0':
                    setZoom(1);
                    setRotation(0);
                    setPosition({ x: 0, y: 0 });
                    break;
                default:
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [onClose, resetHideTimeout]);

    // Handle mouse wheel zoom
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e) => {
            e.preventDefault();
            resetHideTimeout();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            updateZoom(z => z + delta);
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, [resetHideTimeout, updateZoom]);

    // Handle Dragging (Pan)
    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e) => {
            resetHideTimeout();
            const { maxX, maxY } = getBounds();
            const deltaX = e.clientX - dragStartRef.current.x;
            const deltaY = e.clientY - dragStartRef.current.y;

            setPosition(prev => ({
                x: clamp(prev.x + deltaX, -maxX, maxX),
                y: clamp(prev.y + deltaY, -maxY, maxY)
            }));
            dragStartRef.current = { x: e.clientX, y: e.clientY };
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, resetHideTimeout, getBounds]);

    const handleMouseDown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        resetHideTimeout();
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
    };

    // Handle backdrop click
    const handleBackdropClick = useCallback((e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }, [onClose]);


    // Download image - cache-first approach (matches video/audio/document pattern)
    const handleDownload = useCallback(async () => {
        try {
            const downloadUrl = blobUrl || src;
            if (!downloadUrl) return;

            // Trigger download using cached blob URL or src
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = fileName || 'image';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (error) {
            console.error('Download failed:', error);
        }
    }, [blobUrl, src, fileName]);

    // Reset zoom/rotation
    const handleReset = useCallback(() => {
        setZoom(1);
        setRotation(0);
        setPosition({ x: 0, y: 0 });
    }, []);

    const controlsClass = `transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`;

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-50 bg-black/95"
            onMouseMove={resetHideTimeout}
            onClick={handleBackdropClick}
        >
            {/* Fullscreen Image Container */}
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                {effectiveSrc ? (
                    <img
                        ref={imgRef}
                        src={effectiveSrc}
                        alt={alt || 'Image'}
                        className={`max-w-none select-none transition-transform duration-200 ease-out ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                        style={{
                            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                            transformOrigin: 'center center',
                            maxWidth: '100vw',
                            maxHeight: '100vh',
                            objectFit: 'contain'
                        }}
                        draggable={false}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={handleMouseDown}
                    />
                ) : (
                    <div className="flex items-center justify-center text-white/50">
                        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    </div>
                )}
            </div>

            {/* Header Controls Bar - wrapped with key to reset tooltips when hidden */}
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
                                    {fileName || alt || 'Image'}
                                </span>
                            </TooltipTrigger>
                            {isTruncated && (
                                <TooltipContent side="bottom" align="start">
                                    {fileName || alt || 'Image'}
                                </TooltipContent>
                            )}
                        </Tooltip>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-1 sm:gap-2">
                            {/* Zoom Out */}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => updateZoom(z => z - 0.25)}
                                        className="rounded-full bg-black/30 backdrop-blur-sm hover:bg-white/20 text-white"
                                    >
                                        <ZoomOut className="w-5 h-5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Zoom Out (-)</TooltipContent>
                            </Tooltip>

                            {/* Zoom Level - Clickable to reset */}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        onClick={handleReset}
                                        className="text-white text-sm min-w-[55px] text-center bg-black/30 backdrop-blur-sm rounded-full px-2 py-1 hover:bg-white/20"
                                    >
                                        {Math.round(zoom * 100)}%
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Reset (0)</TooltipContent>
                            </Tooltip>

                            {/* Zoom In */}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => updateZoom(z => z + 0.25)}
                                        className="rounded-full bg-black/30 backdrop-blur-sm hover:bg-white/20 text-white"
                                    >
                                        <ZoomIn className="w-5 h-5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Zoom In (+)</TooltipContent>
                            </Tooltip>

                            {/* Divider */}
                            <Separator orientation="vertical" className="h-6 bg-white/20 mx-1 hidden sm:block" />

                            {/* Rotate */}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => updateRotation(r => r + 90)}
                                        className="rounded-full bg-black/30 backdrop-blur-sm hover:bg-white/20 text-white"
                                    >
                                        <RotateCw className="w-5 h-5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Rotate (R)</TooltipContent>
                            </Tooltip>

                            {/* Download */}
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

                            {/* Divider */}
                            <Separator orientation="vertical" className="h-6 bg-white/20 mx-1 hidden sm:block" />

                            {/* Close */}
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

            {/* Footer - Keyboard Hints (no tooltips, no need for provider) */}
            <div className={`absolute bottom-0 left-0 right-0 z-10 select-none ${controlsClass}`}>
                <div className="bg-gradient-to-t from-black/70 via-black/40 to-transparent py-4 px-6">
                    <div className="flex justify-center gap-6 text-white/70 text-xs">
                        <span className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="px-1.5 py-0.5 bg-white/10 text-white/70 text-[10px]">Esc</Badge>
                            <span>Close</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="px-1.5 py-0.5 bg-white/10 text-white/70 text-[10px]">+/-</Badge>
                            <span>Zoom</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="px-1.5 py-0.5 bg-white/10 text-white/70 text-[10px]">R</Badge>
                            <span>Rotate</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="px-1.5 py-0.5 bg-white/10 text-white/70 text-[10px]">0</Badge>
                            <span>Reset</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="px-1.5 py-0.5 bg-white/10 text-white/70 text-[10px]">Scroll</Badge>
                            <span>Zoom</span>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
});

ImageViewer.displayName = 'ImageViewer';

export default ImageViewer;
