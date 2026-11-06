import { memo, useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
import { X, Send, FileText, Music, Film, Image as ImageIcon, Smile, Plus, CloudUpload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
    ALLOWED_FILE_TYPES_STRING,
    isFileAllowed,
    MIME_PREFIX_IMAGE,
    MIME_PREFIX_VIDEO,
    MIME_PREFIX_AUDIO,
    IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS,
    AUDIO_EXTENSIONS,
    EXT_PDF
} from '@/constants/fileTypes';
import { useToast } from "@/hooks/use-toast";
import { useDragDrop } from '@/hooks/useDragDrop';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { Document, Page } from 'react-pdf';
import { getFileIconProps } from '@/utils/fileIcons';
import { generateThumbnail, generateVideoThumbnail } from '@/utils/generateThumbnail';


const PDFPreview = ({ previewUrl, pdfCache }) => {
    // Check cache for existing data
    const cached = pdfCache?.current?.[previewUrl];

    const [numPages, setNumPages] = useState(cached?.numPages || null);
    const [pageSize, setPageSize] = useState(cached?.pageSize || null);
    const [scale, setScale] = useState(cached?.scale || 1);
    const [isReady, setIsReady] = useState(!!cached?.pageSize); // Ready immediately if cached
    const containerRef = useRef(null);

    const onDocumentLoadSuccess = ({ numPages }) => {
        setNumPages(numPages);
        // Cache numPages
        if (pdfCache?.current) {
            // eslint-disable-next-line react-hooks/immutability
            pdfCache.current[previewUrl] = {

                ...pdfCache.current[previewUrl],
                numPages
            };
        }
    };

    // Get original PDF page dimensions
    const onPageLoadSuccess = (page) => {
        const newPageSize = {
            width: page.originalWidth,
            height: page.originalHeight
        };
        setPageSize(newPageSize);
        // Cache pageSize
        if (pdfCache?.current) {
            // eslint-disable-next-line react-hooks/immutability
            pdfCache.current[previewUrl] = {

                ...pdfCache.current[previewUrl],
                pageSize: newPageSize
            };
        }
    };

    // Calculate optimal scale based on container AND PDF aspect ratio
    useEffect(() => {
        const calculateScale = () => {
            if (containerRef.current && pageSize) {
                const containerWidth = containerRef.current.clientWidth - 32;
                const containerHeight = containerRef.current.clientHeight - 60;

                // Calculate scale to fit width
                const scaleX = containerWidth / pageSize.width;
                // Calculate scale to fit height
                const scaleY = containerHeight / pageSize.height;

                // Use the smaller scale to ensure PDF fits both dimensions
                const optimalScale = Math.min(scaleX, scaleY);
                const finalScale = Math.max(optimalScale, 0.3);
                setScale(finalScale);
                setIsReady(true);

                // Cache scale
                if (pdfCache?.current) {

                    pdfCache.current[previewUrl] = {

                        ...pdfCache.current[previewUrl],
                        scale: finalScale
                    };
                }
            }
        };

        const rafId = requestAnimationFrame(calculateScale);
        window.addEventListener('resize', calculateScale);
        return () => {
            cancelAnimationFrame(rafId);
            window.removeEventListener('resize', calculateScale);
        };
    }, [pageSize, previewUrl, pdfCache]);

    return (
        <div
            ref={containerRef}
            className="flex flex-col items-center justify-center flex-1 min-h-0 px-4 py-2 overflow-hidden w-full"
        >
            <div className={`flex flex-col items-center transition-opacity duration-200 ${isReady ? 'opacity-100' : 'opacity-0'}`}>
                <div className="shadow-2xl rounded-lg overflow-hidden border border-slate-700 bg-slate-800 relative group">
                    <Document
                        file={previewUrl}
                        onLoadSuccess={onDocumentLoadSuccess}
                        loading={
                            <div className="w-[250px] aspect-[3/4] flex items-center justify-center text-slate-400 bg-slate-800">
                                Memuat PDF...
                            </div>
                        }
                        error={
                            <div className="w-[250px] aspect-[3/4] flex items-center justify-center text-red-500 p-4 text-center bg-slate-800">
                                Preview PDF Gagal
                            </div>
                        }
                        className="flex justify-center"
                    >
                        <Page
                            pageNumber={1}
                            scale={scale}
                            onLoadSuccess={onPageLoadSuccess}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                            canvasBackground="#FFFFFF"
                        />
                    </Document>
                </div>

                {numPages && (
                    <p className="text-slate-300 text-sm mt-2 font-medium flex-shrink-0">
                        {numPages} Halaman
                    </p>
                )}
            </div>
        </div>
    );
};


/**
 * AttachmentPreviewDialog Component
 * 
 * WhatsApp-style fullscreen attachment preview with:
 * - Multi-file support with carousel/thumbnail bar
 * - Individual caption per attachment (except audio)
 * - File preview (image/video/audio/document)
 * - Add more files button
 * - Remove individual files
 * 
 * @param {Object} props
 * @param {Array} props.attachments - Array of { id, file, type, previewUrl }
 * @param {Function} props.onSend - (attachmentsWithCaptions) => void
 * @param {Function} props.onClose - () => void
 */
const AttachmentPreviewDialog = memo(function AttachmentPreviewDialog({
    attachments = [],
    onSend,
    onClose,
    onUpdateAttachment,
    onAddAttachment,
    onRemoveAttachment
}) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    // Store attachments with their individual captions
    const [localAttachments, setLocalAttachments] = useState(() =>
        attachments.map(att => ({ ...att, caption: '' }))
    );
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const captionInputRef = useRef(null);
    const fileInputRef = useRef(null);
    const emojiPickerRef = useRef(null);
    const emojiButtonRef = useRef(null);
    const fileNameRef = useRef(null);
    const attachmentsRef = useRef(localAttachments);
    const pdfCache = useRef({}); // Cache PDF metadata to prevent reloading
    const mediaRefs = useRef(new Map()); // Map<attachmentId, HTMLVideoElement | HTMLAudioElement>

    // Add logic to capture thumbnail from video stream
    // Captured thumbnail logic logic removed to avoid "Black Frame" race condition.
    // We rely entirely on ChatWindow.processFiles or manual generation via utility.


    // Final Snapshot Optimization:
    // Before sending, try to capture any missing thumbnails from active video elements.
    // This avoids the fallback generator in ChatWindow starting new requests.
    const handleSendAction = useCallback(async () => {
        const finalAttachmentsPromises = localAttachments.map(async att => {
            // If it's a video and missing a thumbnail
            if (att.type === 'video' && (!att.thumbnailUrl || !att.thumbnailData)) {
                try {
                    // Use shared utility for consistent 1.0s seek & 320px resize
                    // This avoids "Black Frame" issues from grabbing t=0 video element
                    const thumbResult = await generateVideoThumbnail(att.file);

                    if (thumbResult) {
                        return {
                            ...att,
                            thumbnailUrl: URL.createObjectURL(thumbResult.blob),
                            thumbnailData: thumbResult
                        };
                    }
                } catch (e) {
                    console.error("Final snapshot failed for", att.id, e);
                }
            }
            return att;
        });

        const finalAttachments = await Promise.all(finalAttachmentsPromises);
        onSend(finalAttachments);
    }, [localAttachments, onSend]);

    const [isTruncated, setIsTruncated] = useState(false);

    const selectedAttachment = localAttachments[selectedIndex];

    // Pause all media when switching attachments
    useEffect(() => {
        mediaRefs.current.forEach((element) => {
            if (element && !element.paused) {
                element.pause();
            }
        });
    }, [selectedIndex]);


    // Check truncation on mount and when filename changes
    useEffect(() => {
        const checkTruncation = () => {
            if (fileNameRef.current) {
                setIsTruncated(fileNameRef.current.scrollWidth > fileNameRef.current.clientWidth);
            }
        };

        checkTruncation();
        // Check again after short delay to ensure layout is stable
        const timer = setTimeout(checkTruncation, 100);

        window.addEventListener('resize', checkTruncation);
        return () => {
            window.removeEventListener('resize', checkTruncation);
            clearTimeout(timer);
        };
    }, [selectedAttachment?.file?.name]); // Re-run when file changes


    // Sync attachmentsRef
    useEffect(() => {
        attachmentsRef.current = localAttachments;
    }, [localAttachments]);



    // Character limit
    const MAX_CAPTION_LENGTH = 500;

    // Helper: Count graphemes (visual characters)
    const getGraphemeCount = (text) => {
        if (!text) return 0;
        try {
            const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
            return [...segmenter.segment(text)].length;
        } catch {
            return [...text].length;
        }
    };

    // Update local attachments when prop changes
    // Better Pattern: "Adjusting state during rendering"
    // This avoids the double-render caused by useEffect state updates
    const [prevAttachments, setPrevAttachments] = useState(attachments);
    if (attachments !== prevAttachments) {
        setPrevAttachments(attachments);
        // MERGE LOGIC: Preserve captions from local state if ID matches
        const mergedAttachments = attachments.map(newAtt => {
            const existingLocal = localAttachments.find(l => l.id === newAtt.id);
            return existingLocal ? { ...newAtt, caption: existingLocal.caption } : { ...newAtt, caption: '' };
        });
        setLocalAttachments(mergedAttachments);

        // Only reset index if out of bounds (allows keeping selection if possible)
        if (selectedIndex >= mergedAttachments.length) {
            setSelectedIndex(0);
        }
    }

    const isCurrentAudio = selectedAttachment?.type === 'audio';

    // Current caption character count
    const caption = selectedAttachment?.caption || '';
    const charCount = useMemo(() => getGraphemeCount(caption), [caption]);

    // Close emoji picker when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            // Don't close if clicking on emoji button (let toggle handle it)
            if (emojiButtonRef.current && emojiButtonRef.current.contains(e.target)) {
                return;
            }
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
                setShowEmojiPicker(false);
            }
        };
        if (showEmojiPicker) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showEmojiPicker]);

    // Auto-resize textarea
    useLayoutEffect(() => {
        if (captionInputRef.current) {
            captionInputRef.current.style.height = 'auto';
            captionInputRef.current.style.height = `${Math.min(captionInputRef.current.scrollHeight, 60)}px`;
        }
    }, [caption]);

    // Format file size
    const formatFileSize = (bytes) => {
        if (!bytes) return '';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    // Get file extension
    const getFileExtension = (filename) => {
        return filename?.split('.').pop()?.toUpperCase() || 'FILE';
    };

    // Handle caption change for current attachment
    const handleCaptionChange = useCallback((value) => {
        if (getGraphemeCount(value) <= MAX_CAPTION_LENGTH) {
            setLocalAttachments(prev => prev.map((att, idx) =>
                idx === selectedIndex ? { ...att, caption: value } : att
            ));
        }
    }, [selectedIndex]);

    // Handle emoji select
    const handleEmojiSelect = (emoji) => {
        const newCaption = caption + emoji.native;
        if (getGraphemeCount(newCaption) <= MAX_CAPTION_LENGTH) {
            handleCaptionChange(newCaption);
        }
        setShowEmojiPicker(false);
        captionInputRef.current?.focus();
    };

    // Handle send
    const handleSend = () => {
        onSend(localAttachments);
    };

    // Handle key press
    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Handle add more files
    const handleAddMore = () => {
        fileInputRef.current?.click();
    };

    const { toast } = useToast();

    // Handle add more files - REFACTORED for Drag and Drop reuse
    const addFiles = async (files) => {
        if (files.length === 0) return;

        // Filter valid files using shared helper
        const validFiles = files.filter(file => isFileAllowed(file));

        if (validFiles.length === 0) {
            toast({
                id: 'file-type-error',
                variant: 'destructive',
                title: 'File type not supported',
                description: 'Please upload a supported format (Image, Video, Audio, or Document).',
            });
            return;
        }

        const newAttachments = await Promise.all(validFiles.map(async (file, index) => {
            let type = 'document';
            const mimeType = file.type || '';
            const ext = file.name.split('.').pop()?.toLowerCase() || '';

            if (mimeType.startsWith(MIME_PREFIX_IMAGE) || IMAGE_EXTENSIONS.includes(ext)) type = 'image';
            else if (mimeType.startsWith(MIME_PREFIX_VIDEO) || VIDEO_EXTENSIONS.includes(ext)) type = 'video';
            else if (mimeType.startsWith(MIME_PREFIX_AUDIO) || AUDIO_EXTENSIONS.includes(ext)) type = 'audio';

            // previewUrl = Original File (High Res) for Dialogs/Full View
            let previewUrl = URL.createObjectURL(file);
            let thumbnailUrl = null; // Low Res
            let thumbnailData = null;

            // Generate thumbnail for image immediately
            if (type === 'image') {
                // Resize using existing Preview URL (High Res Blob) to avoid creating duplicate blob
                const thumbResult = await generateThumbnail(previewUrl);
                if (thumbResult) {
                    thumbnailData = thumbResult;
                    thumbnailUrl = URL.createObjectURL(thumbResult.blob);
                }
            } else if (type === 'video') {
                // Generate video thumbnail immediately
                try {
                    const thumbResult = await generateVideoThumbnail(previewUrl);
                    if (thumbResult) {
                        thumbnailData = thumbResult;
                        thumbnailUrl = URL.createObjectURL(thumbResult.blob);
                    }
                } catch (e) {
                    console.warn('Video thumbnail generation failed:', e);
                }
            }

            return {
                id: `${Date.now()}-${index}`,
                file,
                type,
                status: 'pending',
                progress: 0,
                previewUrl,     // High Res
                thumbnailUrl,   // Low Res
                thumbnailData,
                caption: ''
            };
        }));

        if (onAddAttachment) {
            onAddAttachment(newAttachments);
        } else {
            setLocalAttachments(prev => [...prev, ...newAttachments]);
        }
    };

    // Handle file input change
    const handleFileAdd = async (e) => {
        const files = Array.from(e.target.files);
        await addFiles(files);
        e.target.value = '';
    };

    // Drag and Drop Logic (Refactored)
    const { isDragging, dragHandlers } = useDragDrop(addFiles);

    // Handle remove file
    const handleRemove = (id) => {
        if (onRemoveAttachment) {
            // Let parent handle state removal and blob cleanup
            onRemoveAttachment(id);
            // Local state will update via useEffect sync
        } else {
            // Fallback for standalone
            setLocalAttachments(prev => {
                const newList = prev.filter(att => {
                    if (att.id === id) {
                        // Cleanup blobs when modifying local state (Deleting item)
                        if (att.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(att.previewUrl);
                        if (att.thumbnailUrl?.startsWith('blob:')) URL.revokeObjectURL(att.thumbnailUrl);
                        return false;
                    }
                    return true;
                });
                if (selectedIndex >= newList.length) {
                    setSelectedIndex(Math.max(0, newList.length - 1));
                }
                return newList;
            });
        }
    };

    // Focus caption input when selected changes (if not audio)
    useEffect(() => {
        if (!isCurrentAudio && captionInputRef.current) {
            captionInputRef.current.focus();
        }
    }, [selectedIndex, isCurrentAudio]);

    // Handle global keyboard shortcuts (Enter to send, Esc to close)
    useEffect(() => {
        const handleGlobalKeyDown = (e) => {
            // Escape to close
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
                return;
            }

            // Enter to send (unless in input/textarea)
            if (e.key === 'Enter' && !e.shiftKey) {
                const activeTag = document.activeElement?.tagName?.toLowerCase();
                // Prevent interfering with inputs/textareas which handle Enter themselves
                if (activeTag === 'textarea' || activeTag === 'input') {
                    return;
                }

                e.preventDefault();
                onSend(attachmentsRef.current);
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [onClose, onSend]);


    // Close if all removed
    useEffect(() => {
        if (localAttachments.length === 0) {
            onClose();
        }
    }, [localAttachments.length, onClose]);

    if (!selectedAttachment) return null;

    const { file } = selectedAttachment;
    const fileName = file?.name || 'File';
    // const fileSize = formatFileSize(file?.size); // Unused
    // const fileExt = getFileExtension(fileName); // Unused

    // Note: renderPreview() removed - now rendering is inline in preview area to preserve playback state

    // Render thumbnail for an attachment
    const renderThumbnail = (att, index) => {
        const isSelected = index === selectedIndex;
        const isImage = att.type === 'image';
        const hasCaption = att.caption && att.caption.trim().length > 0;

        // Helper to get styling based on file extension/type
        // Use standard icon utility
        const { Icon, iconClass, containerClass } = !isImage
            ? getFileIconProps(att.file.name, att.file.type)
            : {};

        return (
            <div
                key={att.id}
                className={`relative group cursor-pointer flex-shrink-0 w-16 h-16 transition-transform duration-200 transform-gpu`}
                onClick={() => setSelectedIndex(index)}
            >
                {/* Content Container with Border/Radius/Overflow */}
                <div className={`w-full h-full rounded-md border overflow-hidden transition-all duration-300 ease-out
                                ${isSelected ? 'ring-2 ring-primary border-transparent scale-105' : 'border-slate-600 hover:border-primary/50 scale-100'}
                                flex items-center justify-center ${isImage ? '' : containerClass}`}>
                    {isImage ? (
                        <img
                            src={att.thumbnailUrl || att.previewUrl}
                            alt={att.file.name}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center relative w-full h-full">
                            <Icon className={iconClass} />
                        </div>
                    )}
                </div>

                {/* Caption indicator */}
                {hasCaption && att.type !== 'audio' && (
                    <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-0.5 z-10 pointer-events-none">
                        <Badge variant="secondary" className="rounded-none rounded-t-sm bg-black/60 border-0 px-1 py-0.5 text-[8px] h-3">
                            <span className="w-1 h-1 rounded-full bg-white/90" />
                        </Badge>
                    </div>
                )}

                {/* Remove button - Floating Outside */}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); handleRemove(att.id); }}
                    className="absolute -top-2 -right-2 w-5 h-5 p-0 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-full 
                               opacity-0 group-hover:opacity-100 transition-all shadow-md z-20 ring-1 ring-background"
                >
                    <X className="w-3 h-3" />
                </Button>
            </div>
        );
    };

    return (
        <div
            className="fixed inset-0 z-50 bg-slate-950/95 flex flex-col"
            {...dragHandlers}
        >
            {/* Drag and Drop Overlay */}
            {isDragging && (
                <div className="absolute inset-0 z-[60] bg-slate-950/80 backdrop-blur-sm border-2 border-dashed border-primary/50 m-4 rounded-xl flex items-center justify-center pointer-events-none">
                    <div className="flex flex-col items-center justify-center text-primary animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-4 rounded-full bg-primary/20 mb-4">
                            <CloudUpload className="h-12 w-12" />
                        </div>
                        <h3 className="text-xl font-semibold">Drop to Add Files</h3>
                    </div>
                </div>
            )}
            {/* Hidden file input for adding more */}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ALLOWED_FILE_TYPES_STRING}
                className="hidden"
                onChange={handleFileAdd}
            />

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3">
                <div className="flex flex-col justify-center text-slate-200 overflow-hidden mr-4">
                    <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                            <span
                                ref={fileNameRef}
                                className="font-medium truncate max-w-[200px] sm:max-w-[400px] cursor-default"
                            >
                                {fileName}
                            </span>
                        </TooltipTrigger>
                        {isTruncated && (
                            <TooltipContent side="bottom" align="start">
                                {fileName}
                            </TooltipContent>
                        )}
                    </Tooltip>

                    {localAttachments.length > 1 && (
                        <span className="text-xs text-slate-500">{selectedIndex + 1} dari {localAttachments.length} file</span>
                    )}
                </div>

                <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="rounded-full bg-black/30 backdrop-blur-sm hover:bg-red-500/80 text-white transition-colors flex-shrink-0"
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Close (Esc)</TooltipContent>
                </Tooltip>
            </div>

            <Separator className="bg-slate-800" />


            {/* Preview Area - Render ALL items, show only selected via CSS to preserve playback state */}
            <div className="flex-1 flex overflow-hidden min-h-0 relative">
                {localAttachments.map((att, index) => {
                    const isActive = index === selectedIndex;
                    const attFileName = att.file?.name || 'File';
                    const attFileSize = formatFileSize(att.file?.size);
                    const attFileExt = getFileExtension(attFileName);

                    return (
                        <div
                            key={att.id}
                            className={`absolute inset-0 flex transition-opacity duration-200 ${isActive ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                                }`}
                        >
                            {att.type === 'image' && (
                                <div className="flex items-center justify-center flex-1 min-h-0 p-4 overflow-hidden">
                                    <img
                                        src={att.previewUrl}
                                        alt={attFileName}
                                        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                                    />
                                </div>
                            )}

                            {att.type === 'video' && (
                                <div className="flex items-center justify-center flex-1 min-h-0 p-4 overflow-hidden">
                                    {isActive ? (
                                        <video
                                            ref={(el) => {
                                                if (el) mediaRefs.current.set(att.id, el);
                                                else mediaRefs.current.delete(att.id);
                                            }}
                                            src={att.previewUrl}
                                            controls
                                            className="max-w-full max-h-full rounded-lg shadow-2xl"
                                            autoPlay={false}
                                            // Capture Metadata (Duration)
                                            onLoadedMetadata={(e) => {
                                                const duration = e.target.duration;
                                                if (duration && onUpdateAttachment) {
                                                    onUpdateAttachment(att.id, {
                                                        meta: { ...att.meta, duration }
                                                    });
                                                }
                                            }}
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center text-slate-500">
                                            <Film className="w-16 h-16 mb-4 opacity-50" />
                                            <span className="text-sm">Video Preview</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {att.type === 'audio' && (
                                <div className="flex flex-col items-center justify-center flex-1 p-8 gap-6">
                                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-2xl">
                                        <Music className="w-16 h-16 text-white" />
                                    </div>
                                    <p className="text-slate-300 text-sm truncate max-w-xs">{attFileName}</p>
                                    {isActive && (
                                        <audio
                                            ref={(el) => {
                                                if (el) mediaRefs.current.set(att.id, el);
                                                else mediaRefs.current.delete(att.id);
                                            }}
                                            src={att.previewUrl}
                                            controls
                                            className="w-full max-w-md"
                                            // Capture Metadata (Duration)
                                            onLoadedMetadata={(e) => {
                                                const duration = e.target.duration;
                                                if (duration && onUpdateAttachment) {
                                                    onUpdateAttachment(att.id, {
                                                        meta: { ...att.meta, duration }
                                                    });
                                                }
                                            }}
                                        />
                                    )}
                                </div>
                            )}

                            {att.type === 'document' && EXT_PDF.includes(attFileExt.toLowerCase()) && (
                                <PDFPreview previewUrl={att.previewUrl} pdfCache={pdfCache} />
                            )}

                            {att.type === 'document' && attFileExt !== 'PDF' && (
                                <div className="flex flex-col items-center justify-center flex-1 p-8 gap-4">
                                    <Card className="w-40 h-48 bg-slate-700/50 border-slate-600 shadow-2xl">
                                        <CardContent className="flex flex-col items-center justify-center h-full p-4">
                                            <FileText className="w-16 h-16 text-slate-400 mb-4" />
                                            <span className="text-slate-300 text-lg font-medium text-center">Preview tidak tersedia</span>
                                            <span className="text-slate-500 text-sm mt-1">{attFileSize} - {attFileExt}</span>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Thumbnail Bar */}
            {localAttachments.length >= 1 && (
                <>
                    <Separator className="bg-slate-800" />
                    <div className="px-4 py-3 overflow-visible">
                        <ScrollArea className="w-full overflow-visible">
                            <div className="flex items-center justify-center gap-3 p-3">
                                {localAttachments.map((att, index) => renderThumbnail(att, index))}

                                {/* Add more button */}
                                <Card
                                    className="w-16 h-16 flex-shrink-0 border-2 border-dashed border-slate-600 
                                               bg-transparent hover:bg-slate-800 hover:border-slate-400 cursor-pointer
                                               flex items-center justify-center transition-colors"
                                    onClick={handleAddMore}
                                >
                                    <Plus className="w-6 h-6 text-slate-500" />
                                </Card>
                            </div>
                            <ScrollBar orientation="horizontal" className="h-1.5" />
                        </ScrollArea>
                    </div>
                </>
            )}

            <Separator className="bg-slate-800" />

            {/* Footer - Caption & Send */}
            <div className="p-4">
                <div className="max-w-2xl mx-auto flex items-end gap-3">
                    {/* Caption Input Area - Always rendered to prevent layout shift */}
                    <div className="flex-1 relative">
                        {/* Emoji Picker - Only for non-audio */}
                        {!isCurrentAudio && showEmojiPicker && (
                            <div
                                ref={emojiPickerRef}
                                className="absolute bottom-full mb-2 left-0 z-50"
                            >
                                <Picker
                                    data={data}
                                    onEmojiSelect={handleEmojiSelect}
                                    theme="dark"
                                    previewPosition="none"
                                />
                            </div>
                        )}

                        <div className={`border rounded-lg px-3 py-2 transition-colors
                                       ${isCurrentAudio
                                ? 'bg-slate-900/50 border-transparent'
                                : 'bg-slate-800 border-input focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/50'
                            }`}>
                            <ScrollArea className="w-full min-h-[60px] max-h-[60px]">
                                {isCurrentAudio ? (
                                    <div className="flex items-center min-h-[24px] py-1 text-slate-500 text-sm italic">
                                        Audio akan dikirim tanpa keterangan
                                    </div>
                                ) : (
                                    <textarea
                                        ref={captionInputRef}
                                        value={caption}
                                        onChange={(e) => handleCaptionChange(e.target.value)}
                                        onKeyDown={handleKeyPress}
                                        placeholder={`Keterangan untuk ${fileName.length > 20 ? fileName.slice(0, 20) + '...' : fileName}`}
                                        className="bg-transparent border-0 focus:ring-0 shadow-none w-full text-sm leading-5 
                                                   text-slate-200 placeholder:text-slate-500 resize-none overflow-hidden 
                                                   min-h-[24px] focus:outline-none py-0 block"
                                        rows={1}
                                    />
                                )}
                            </ScrollArea>

                            {/* Bottom bar: Emoji + Counter */}
                            <div className={`flex items-center justify-between mt-1.5 pt-1.5 border-t 
                                            ${isCurrentAudio ? 'border-transparent' : 'border-slate-700/50'}`}>

                                {/* Emoji - Disabled/Hidden style for Audio to keep height */}
                                <div className={isCurrentAudio ? 'opacity-0 pointer-events-none' : ''}>
                                    <Tooltip delayDuration={0}>
                                        <TooltipTrigger asChild>
                                            <Button
                                                ref={emojiButtonRef}
                                                variant="ghost"
                                                size="icon"
                                                disabled={isCurrentAudio}
                                                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                                className={`h-7 w-7 ${showEmojiPicker ? 'text-purple-400 bg-purple-900/30' : 'text-slate-500 hover:text-slate-400'}`}
                                            >
                                                <Smile className="w-4 h-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Emoji</TooltipContent>
                                    </Tooltip>
                                </div>

                                {/* Character Counter */}
                                {!isCurrentAudio && charCount > 0 && (
                                    <span className={`text-[10px] font-medium tabular-nums ${charCount >= MAX_CAPTION_LENGTH
                                        ? 'text-red-400'
                                        : charCount >= MAX_CAPTION_LENGTH * 0.9
                                            ? 'text-amber-400'
                                            : 'text-slate-500'
                                        }`}>
                                        {charCount}/{MAX_CAPTION_LENGTH}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Send Button with count badge */}
                    <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                            <Button
                                onClick={handleSendAction}
                                className="relative w-12 h-12 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 
                                               hover:from-purple-500 hover:to-indigo-500 p-0 flex-shrink-0"
                            >
                                <Send className="w-5 h-5 text-white ml-0.5" />
                                {localAttachments.length > 1 && (
                                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full 
                                                       text-xs font-bold text-white flex items-center justify-center">
                                        {localAttachments.length}
                                    </span>
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Kirim</TooltipContent>
                    </Tooltip>
                </div>
            </div>
        </div>
    );
});

export default AttachmentPreviewDialog;
