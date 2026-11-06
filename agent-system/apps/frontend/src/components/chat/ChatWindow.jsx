import { Card, CardHeader, CardFooter } from '@/components/ui/card';
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MoreVertical, Paperclip, Smile, Send, MessageSquare, Image, ChevronsDown, Video, Mic, FileText, Camera, X, Loader2, CloudUpload } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAvatarColor, getInitials } from '@/utils/avatar';
import MessageBubble from './MessageBubble';
import DateSeparator from './DateSeparator';
import UnreadDivider from './UnreadDivider';
import TypingIndicator from './TypingIndicator';
import AttachmentPreviewDialog from './AttachmentPreviewDialog';
import {
    ALLOWED_FILE_TYPES_STRING,
    isFileAllowed,
    ACCEPT_IMAGE,
    ACCEPT_VIDEO,
    ACCEPT_AUDIO,
    MIME_PREFIX_IMAGE,
    MIME_PREFIX_VIDEO,
    MIME_PREFIX_AUDIO
} from '@/constants/fileTypes';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { formatDateLabel as getDateLabel } from '@/utils/formatUtils';
import { uploadService } from '@/services/uploadService';
import { generateThumbnail, generateVideoThumbnail } from '@/utils/generateThumbnail';
import { getMetadata, saveMetadata } from '@/services/attachmentCache';
import { compressMedia, formatBytes, getImageDimensions } from '@/services/mediaCompressionService';
import { config } from '@/config';
import { set } from 'idb-keyval'; // Direct IDB access for persistence
import { Fragment, useCallback, useEffect, useRef, useState, useLayoutEffect, useMemo } from 'react';
import { socket } from '@/lib/socket';
import { Debouncer, Throttler } from '@tanstack/react-pacer';
import { pLimit } from '@/utils/concurrency';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchAttachment } from '@/hooks/useAttachment';
import { useDragDrop } from '@/hooks/useDragDrop';
import { acquireBlobUrl, releaseBlobUrl } from '@/hooks/useObjectUrl';
import TransferChatDialog from './TransferChatDialog';

// Global concurrency limiter for uploads (shared across all batches)
const globalUploadLimiter = pLimit(5);

const ChatWindow = ({ activeChat, messages, inputValue, setInputValue, onSendMessage, onKeyPress, messagesEndRef: externalBottomRef, onHandleChat, onCloseChat, onTransferChat, currentUser }) => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const unreadRef = useRef(null);
    const bottomRef = useRef(null);
    const scrollAreaRef = useRef(null); // Ref for ScrollArea viewport
    const lastChatIdRef = useRef(null);
    const emojiPickerRef = useRef(null); // Ref for emoji picker container
    const textareaRef = useRef(null); // Ref for textarea input
    const hasInitialScrolledRef = useRef(false); // Track if initial scroll happened
    const [isScrollReady, setIsScrollReady] = useState(false); // Anti-flicker: hide until scroll positioned
    const [isScrolling, setIsScrolling] = useState(false);
    const [showUnreadDivider, setShowUnreadDivider] = useState(true);
    const [showTransferDialog, setShowTransferDialog] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [currentStickyDate, setCurrentStickyDate] = useState(null); // Current date label for floating header
    const currentStickyDateRef = useRef(null); // Ref for stable comparison
    const scrollTimeout = useRef(null);
    const unreadHideTimeout = useRef(null); // Timer for smart hide
    const messageObserverRef = useRef(null); // Observer for read receipts
    const sentReadReceipts = useRef(new Set()); // Track sent read receipts
    const [isCustomerTyping, setIsCustomerTyping] = useState(false); // Customer typing indicator
    const typingTimeoutRef = useRef(null); // Debounce timer for agent typing
    const isAgentTypingRef = useRef(false); // Track if we already emitted typing:true
    const [isAtBottom, setIsAtBottom] = useState(true); // Track if scrolled to bottom
    const initialUnreadCountRef = useRef(0); // Track unread count when chat first opened
    const initialFirstUnreadIndexRef = useRef(-1); // Track first unread index when chat first opened
    const [showFab, setShowFab] = useState(false); // FAB visibility
    const fabCooldownRef = useRef(false); // Prevent FAB flicker after click
    const fileInputRef = useRef(null); // Ref for file input
    const currentUploadTypeRef = useRef('document'); // Track current upload type
    const [attachments, setAttachments] = useState([]); // [{ file, type, status, progress, error, data, previewUrl }]
    // Remove blocking state: const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
    const [previewAttachment, setPreviewAttachment] = useState([]); // Array of attachments for preview dialog
    // Optimistic uploading message: array of message objects
    const [uploadingMessage, setUploadingMessage] = useState([]);

    // Scroll Masking State (Masks FAB during programmatic scroll)
    const [isAutoScrolling, setIsAutoScrolling] = useState(false);

    // Upload Abort Controllers map
    const uploadControllersRef = useRef({});

    // Handle Upload Cancel
    const handleCancelUpload = useCallback((messageId, attachmentIndex) => {
        const key = `${messageId}-${attachmentIndex}`;
        const controller = uploadControllersRef.current[key];
        if (controller) {
            controller.abort();
            delete uploadControllersRef.current[key];
            // Remove from UI immediately
            setUploadingMessage(prev => prev.filter(msg => msg.id !== messageId));
        }
    }, []);

    // Handle File Selection
    const handleFileClick = (type) => {
        if (!fileInputRef.current) return;

        currentUploadTypeRef.current = type;

        let accept = '*/*';
        switch (type) {
            case 'image':
                accept = `${ACCEPT_IMAGE},${ACCEPT_VIDEO}`;
                break;
            case 'audio':
                accept = ACCEPT_AUDIO;
                break;
            case 'document':
                accept = ALLOWED_FILE_TYPES_STRING;
                break;
        }

        fileInputRef.current.accept = accept;
        // Enable multiple selection only for documents
        fileInputRef.current.multiple = (type === 'document');
        fileInputRef.current.click();
        fileInputRef.current.multiple = (type === 'document');
        fileInputRef.current.click();
    };

    const handleTransferChat = async (targetAgent) => {
        try {
            await onTransferChat(targetAgent);
            toast({
                title: "Chat Transferred",
                description: targetAgent ? `Transferred to ${targetAgent.name}` : "Returned to queue",
                className: 'bg-green-600 text-white'
            });
            // Dialog closing delegated to TransferChatDialog via await success
        } catch (error) {
            console.error('Transfer failed', error);
            toast({
                title: "Transfer Failed",
                description: "Could not transfer chat.",
                variant: "destructive"
            });
            throw error; // Rethrow so TransferChatDialog knows it failed
        }
    };

    const processFiles = useCallback(async (files) => {
        if (files.length === 0) return;

        // Filter valid files
        const validFiles = files.filter(file => isFileAllowed(file));

        if (validFiles.length === 0) {
            toast({
                id: 'file-type-error',
                variant: 'destructive',
                title: 'File type not supported',
                description: 'Please upload a supported format (Image, Video, Audio, or Document).',
            })
            return;
        }

        // Create attachments WITH eager thumbnail generation for images (and lazy for videos)
        const newAttachments = await Promise.all(validFiles.map(async (file, index) => {
            // Auto-detect type from file MIME type
            let type = 'document';
            const mimeType = file.type || '';

            if (mimeType.startsWith(MIME_PREFIX_IMAGE)) {
                type = 'image';
            } else if (mimeType.startsWith(MIME_PREFIX_VIDEO)) {
                type = 'video';
            } else if (mimeType.startsWith(MIME_PREFIX_AUDIO)) {
                type = 'audio';
            }

            // previewUrl = Original File (High Res) for Dialogs/Full View
            // Use Registry to ensure dedup with AudioPlayer
            let previewUrl = acquireBlobUrl(file);
            let thumbnailUrl = null;
            let thumbnailData = null;

            // OPTIMIZATION: Generate Thumbnail Immediately
            // "Pastikan preview image saat upload adalah menggunakan thumbnail" -> We will use thumbnailUrl for the Message Bubble
            if (type === 'image') {
                try {
                    // Resize using existing Preview URL (High Res Blob) to avoid creating duplicate blob
                    const thumbResult = await generateThumbnail(previewUrl);
                    if (thumbResult) {
                        thumbnailData = thumbResult;
                        // Use Registry for Thumbnail dedup
                        thumbnailUrl = acquireBlobUrl(thumbResult.blob);
                    }
                } catch (e) {
                    console.warn('Preview thumbnail generation failed:', e);
                }
            } else if (type === 'video') {
                try {
                    // Generate video thumbnail immediately using robust utility
                    // This fixes "Black/Full Size" issues by ensuring we use the standard 320x320 logic right away
                    const thumbResult = await generateVideoThumbnail(previewUrl);
                    if (thumbResult) {
                        thumbnailData = thumbResult;
                        thumbnailUrl = acquireBlobUrl(thumbResult.blob);

                        // CRITICAL: Seed Cache Immediately
                        // This prevents VideoThumbnail (in UI) from regenerating it
                        // And ensures consistent 320px thumbnail is used everywhere
                        const meta = {
                            thumbnail: thumbResult.blob,
                            width: thumbResult.width,
                            height: thumbResult.height,
                            originalWidth: thumbResult.originalWidth,
                            originalHeight: thumbResult.originalHeight,
                            duration: thumbResult.duration || 0,
                            size: file.size
                        };
                        queryClient.setQueryData(['attachment-meta', previewUrl], meta);
                        saveMetadata(previewUrl, meta).catch(e => console.warn('Failed to seed IDB:', e));
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
                thumbnailUrl,   // Low Res (for list/upload bubble)
                thumbnailData,  // Data for IDB
            };
        }));

        // Append to existing preview attachments instead of replacing?
        // Dialog logic usually starts with what's given. 
        // If dialog is open, we might want to add.
        // If dialog is closed, we open it.
        // Current handleFileChange replaced everything. 
        // Let's decide: Paste should probably ADD if dialog is open, or START if closed.
        // However, handleFileChange logic was: setPreviewAttachment(newAttachments).
        // Let's keep it consistent: open dialog with THESE files.
        // Wait, if I paste multiple times, I expect them to accumulate?
        // If I use `setPreviewAttachment(prev => [...prev, ...newAttachments])`, it supports accumulation.
        setPreviewAttachment(prev => [...prev, ...newAttachments]);

    }, []);

    const handleFileChange = async (e) => {
        const files = Array.from(e.target.files);
        await processFiles(files);
        e.target.value = ''; // Reset input
    };

    const handlePaste = useCallback(async (e) => {
        // Prevent default paste behavior if files are present
        if (e.clipboardData && e.clipboardData.files.length > 0) {
            e.preventDefault();
            const files = Array.from(e.clipboardData.files);
            await processFiles(files);
        }
    }, [processFiles]);

    // Drag and Drop Logic (Refactored)
    const { isDragging, dragHandlers } = useDragDrop(processFiles);

    const handleUpdateAttachment = useCallback((id, updates) => {
        setPreviewAttachment(prev => prev.map(att => att.id === id ? { ...att, ...updates } : att));
    }, []);

    // Handle adding more attachments from Preview Dialog
    const handleAddAttachment = useCallback((newAttachments) => {
        setPreviewAttachment(prev => [...prev, ...newAttachments]);
    }, []);

    // Handle remove attachment from Preview Dialog
    const handleRemovePreviewAttachment = useCallback((id) => {
        setPreviewAttachment(prev => {
            const att = prev.find(a => a.id === id);
            if (att) {
                // Use registry release
                if (att.previewUrl?.startsWith('blob:')) releaseBlobUrl(att.file); // Pass FILE/BLOB, not URL if possible
                // Fallback: If we don't have file immediately accessible here (we do, att.file), use it.
                // But pre-existing logic used URL.
                // Note: releaseBlobUrl needs the BLOB object.
                // att.file is available in the mapped object.

                // For thumbnail, we generated it?
                // Thumbnails are usually separate blobs. We should acquire/release them too if we want registry benefits there.
                // But duplicate audio URLs was the main issue. Thumbnails don't usually cause playback duplicates.
                if (att.thumbnailUrl?.startsWith('blob:')) URL.revokeObjectURL(att.thumbnailUrl);
            }
            return prev.filter(a => a.id !== id);
        });
    }, []);

    const removeAttachment = (id) => {
        setAttachments(prev => prev.filter(att => att.id !== id));
    };

    // Handle send from preview dialog (supports multiple files with individual captions)
    // Handle send from preview dialog (supports multiple files with individual captions)
    // Handle send from preview dialog (supports multiple files with individual captions)
    const handlePreviewSend = useCallback(async (attachmentsWithCaptions) => {
        if (!attachmentsWithCaptions || attachmentsWithCaptions.length === 0) return;

        // No longer blocking: setIsUploadingAttachment(true);
        // Copy attachments to avoid mutation
        let attachmentsToUpload = [...attachmentsWithCaptions];

        // Fallback: Generate thumbnails for videos that don't have one (unseen in preview)
        // This ensures the "1 request" goal is met: 
        // - If viewed: 0 extra requests (reused stream)
        // - If NOT viewed: 1 request (now)
        const attachmentsWithThumbnails = await Promise.all(attachmentsToUpload.map(async (att) => {
            if (att.type === 'video' && !att.thumbnailUrl) {
                // OPTIMIZATION: Check Cache First!
                // If VideoThumbnail already generated it (e.g. user previewed it), use it.
                const cachedMeta = queryClient.getQueryData(['attachment-meta', att.previewUrl]);
                if (cachedMeta?.thumbnail) {
                    // Use Registry to get URL from cached blob
                    const blob = (cachedMeta.thumbnail instanceof Blob) ? cachedMeta.thumbnail : null;
                    const url = acquireBlobUrl(blob) || (typeof cachedMeta.thumbnail === 'string' ? cachedMeta.thumbnail : null);

                    if (url) {
                        return {
                            ...att,
                            thumbnailUrl: url,
                            thumbnailData: {
                                ...cachedMeta,
                                blob: cachedMeta.thumbnail // Unify naming
                            }
                        };
                    }
                }

                // Use imported utility. It returns { blob, width, height, duration }
                // We need to create a URL for the UI (thumbnailUrl) and store the data for later (thumbnailData)
                try {
                    const res = await generateVideoThumbnail(att.previewUrl);
                    if (res) {
                        // Use Registry
                        const url = acquireBlobUrl(res.blob);
                        return { ...att, thumbnailUrl: url, thumbnailData: res };
                    }
                } catch (e) {
                    console.warn('Failed to generate video thumbnail:', e);
                }
            }
            return att;
        }));

        attachmentsToUpload = attachmentsWithThumbnails;

        setPreviewAttachment([]); // Close dialog

        // Create optimistic uploading messages - one per attachment with its caption
        const baseTimestamp = Date.now();

        // Prepare attachments with dimensions for instant layout (no shift)
        const attachmentsWithMeta = await Promise.all(attachmentsToUpload.map(async (att) => {
            let meta = null;
            if (att.type === 'image') {
                try {
                    // Extract dimensions immediately for optimistic render
                    // This prevents layout shift while waiting for compression

                    // OPTIMIZATION: Use pre-calculated dimensions from Dialog if available
                    if (att.thumbnailData?.originalWidth && att.thumbnailData?.originalHeight) {
                        meta = {
                            width: att.thumbnailData.originalWidth,
                            height: att.thumbnailData.originalHeight
                        };
                    } else {
                        // Fallback: Reuse existing previewUrl
                        const dims = await getImageDimensions(att.previewUrl || att.file);
                        meta = { width: dims.width, height: dims.height };
                    }
                } catch (e) {
                    console.warn('Failed to get dimensions for optimistic image:', e);
                }
            }
            return { ...att, meta };
        }));

        const optimisticMessages = attachmentsWithMeta.map((att, idx) => ({
            id: `uploading-${baseTimestamp}-${idx}`,
            sender: 'agent',
            senderType: 'agent',
            agentRole: currentUser?.role || 'agent',
            type: 'attachment',
            content: att.type !== 'audio' ? (att.caption || '') : '',
            status: 'pending',
            timestamp: new Date(baseTimestamp + idx).toISOString(), // Slightly different timestamps for ordering
            attachments: [{
                id: idx,
                fileUrl: att.previewUrl || '', // Use preview URL temporarily
                fileName: att.file.name,
                fileOrigin: att.file.name,
                fileType: att.type,
                fileSize: att.file.size,
                caption: att.type !== 'audio' ? (att.caption || '') : '',
                // Upload state
                uploadStatus: 'uploading',
                uploadProgress: 0,
                thumbnailUrl: att.thumbnailUrl || null, // Use pre-generated thumbnail
                meta: att.meta, // Dimensions for instant layout (WhatsApp Style)
                onCancelUpload: () => handleCancelUpload(`uploading-${baseTimestamp}-${idx}`, 0)
            }],
        }));

        // Append to existing uploading messages
        setUploadingMessage(prev => [...prev, ...optimisticMessages]);

        // Auto-scroll to bottom to show the new message
        setTimeout(() => {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);

        // Upload and Send Logic for each attachment INDEPENDENTLY
        // This ensures one failure doesn't block others (though we parallelize starts here)

        // We run them in parallel but handle their state updates individually
        // Note: Promise.all isn't strictly needed if we don't care about "all done" event, 
        // effectively launching separate processes.

        // Upload and Send Logic for each attachment SEQUENTIALLY
        // This ensures strict ordering of messages in the chat (File 1 -> File 2 -> File 3)
        // Concurrency between *different* batches is still supported (Function is async)

        // Upload and Send Logic - OPTIMIZED PARALLEL BATCH
        // 1. Start ALL uploads in parallel (fastest)
        // 2. Wait for ALL to settle (success or fail)
        // 3. Send successful messages IN ORDER
        // 4. Handle errors individually without blocking the rest

        // 5. Concurrency Limit: Max 5 concurrent uploads globally
        const uploadPromises = optimisticMessages.map((optMsg, idx) => {
            return globalUploadLimiter(async () => {
                const att = attachmentsToUpload[idx];
                const abortController = new AbortController();

                // Store controller
                const key = `${optMsg.id}-${0}`;
                uploadControllersRef.current[key] = abortController;

                // Update progress for THIS specific message ID
                const updateProgress = (progress) => {
                    setUploadingMessage(prev => prev.map(msg =>
                        msg.id === optMsg.id
                            ? { ...msg, attachments: msg.attachments.map(a => ({ ...a, uploadProgress: progress })) }
                            : msg
                    ));
                };

                try {
                    // Robust parsing helper
                    const findUploadData = (obj) => {
                        if (!obj) return null;
                        if (obj.storedName || obj.urlPath) return obj;
                        if (obj.data) return findUploadData(obj.data);
                        if (obj.file) return findUploadData(obj.file);
                        return null;
                    };

                    // STEP 1: Compress media (WhatsApp-style, after Send click)
                    let fileToUpload = att.file;
                    let wasCompressed = false;

                    // Update status to show compression
                    setUploadingMessage(prev => prev.map(msg =>
                        msg.id === optMsg.id
                            ? { ...msg, attachments: msg.attachments.map(a => ({ ...a, uploadStatus: 'compressing' })) }
                            : msg
                    ));

                    // Compress with progress callback
                    const compressionResult = await compressMedia(
                        att.file,
                        (compressionProgress) => {
                            // Show compression progress (0-50% of total progress)
                            updateProgress(Math.round(compressionProgress * 0.5));
                        },
                        { previewUrl: att.previewUrl } // Pass existing blob URL to avoid regeneration
                    );

                    if (!compressionResult.skipped) {
                        fileToUpload = compressionResult.file;
                        wasCompressed = true;
                        console.log(`[Compression] ${att.file.name}: ${formatBytes(compressionResult.originalSize)} → ${formatBytes(compressionResult.compressedSize)} (${Math.round((1 - compressionResult.compressedSize / compressionResult.originalSize) * 100)}% smaller)`);
                    }

                    // Capture metadata (width/height) for instant layout
                    // If compression occurred, use new dimensions. Otherwise fallback to original optimistic dimensions.
                    const meta = (compressionResult.width && compressionResult.height) ? {
                        width: compressionResult.width,
                        height: compressionResult.height
                    } : att.meta;

                    // Update status back to uploading AND inject metadata (preserving it)
                    setUploadingMessage(prev => prev.map(msg =>
                        msg.id === optMsg.id
                            ? {
                                ...msg,
                                attachments: msg.attachments.map(a =>
                                    a.file === att.file ? { ...a, uploadStatus: 'uploading', meta } : a
                                )
                            }
                            : msg
                    ));

                    // STEP 2: Upload compressed file (progress 50-100%)
                    const response = await uploadService.upload(
                        fileToUpload,
                        att.type,
                        (uploadProgress) => updateProgress(50 + Math.round(uploadProgress * 0.5)),
                        abortController
                    );

                    const uploadData = findUploadData(response);

                    if (!uploadData || (!uploadData.storedName && !uploadData.urlPath)) {
                        throw new Error(`Invalid upload response for ${att.file.name}`);
                    }

                    const fileUrl = uploadData.urlPath || `/uploads/${uploadData.storedName}`;
                    const fullUrl = `${config.apiUrl}${fileUrl}`;

                    // CACHE LOGIC: Handle Compression vs skipped
                    // Scenario 1: Skipped (Original file used) -> Cache Original + Original Thumbnail
                    // Scenario 2: Compressed (New file) -> Generate New Thumbnail -> Cache Compressed + New Thumbnail

                    // Unified Logic for All Types (Image, Audio, Video)
                    try {
                        let finalBlob = att.file; // Default to original
                        // Use compressed blob if available
                        if (wasCompressed) {
                            finalBlob = fileToUpload;
                        }

                        // 1. CACHE THE FILE (IDB + Query)
                        // Explicitly save the file blob to IDB to prevent re-downloads
                        console.log('[Upload Cache] Saving to IDB:', fullUrl, finalBlob.type, finalBlob.size);
                        try {
                            await set(fullUrl, finalBlob);
                        } catch (e) { console.warn('[Upload Cache] IDB Save Failed:', e); }

                        // Seed Memory Cache immediately
                        queryClient.setQueryData(['attachment', fullUrl], finalBlob);

                        // 2. METADATA HANDLING
                        // Image, Video & Audio need metadata (Thumbnail, Dimensions, Duration, Size)
                        if (att.type === 'image' || att.type === 'video' || att.type === 'audio') {
                            const isVideo = att.type === 'video';
                            const isAudio = att.type === 'audio';
                            let metaToSave = null;

                            // Robust Check: Reuse thumbnail if blob exists.
                            const hasThumbnailBlob = att.thumbnailData?.blob;

                            // For Audio, we typically don't have thumbnailData from preview
                            if (isAudio) {
                                metaToSave = {
                                    size: finalBlob.size,
                                    duration: compressionResult?.duration || 0
                                };
                            } else if (hasThumbnailBlob) {
                                // REUSE: Use existing thumbnail from preview/optimistic state
                                // Try to recover duration if missing from thumbnailData
                                const duration = (att.thumbnailData.duration > 0)
                                    ? att.thumbnailData.duration
                                    : (compressionResult?.duration || 0);

                                metaToSave = {
                                    thumbnail: att.thumbnailData.blob,
                                    width: att.thumbnailData.width,
                                    height: att.thumbnailData.height,
                                    originalWidth: att.thumbnailData.originalWidth,
                                    originalHeight: att.thumbnailData.originalHeight,
                                    duration: duration,
                                    size: finalBlob.size
                                };
                            } else {
                                // REGENERATE: Only if we truly lack a thumbnail blob
                                try {
                                    const gen = isVideo
                                        ? await generateVideoThumbnail(finalBlob)
                                        : await generateThumbnail(finalBlob);

                                    if (gen) {
                                        metaToSave = {
                                            thumbnail: gen.blob,
                                            width: gen.width,
                                            height: gen.height,
                                            originalWidth: gen.originalWidth,
                                            originalHeight: gen.originalHeight,
                                            duration: gen.duration || 0,
                                            size: finalBlob.size
                                        };
                                    }
                                } catch (err) {
                                    console.warn('[Upload Cache] Metadata generation failed:', err);
                                }
                            }

                            if (metaToSave) {
                                await saveMetadata(fullUrl, metaToSave);
                                // CRITICAL: Seed metadata cache directly so components pick up new data INSTANTLY
                                queryClient.setQueryData(['attachment-meta', fullUrl], metaToSave);
                            }
                        }
                    } catch (err) {
                        console.error('[Upload Cache] Global failure:', err);
                    }

                    // Removed invalidateQueries to avoid race conditions causing re-fetch
                    // queryClient.invalidateQueries({ queryKey: ['attachment-meta', fullUrl] });

                    // UPDATE UI STATE: Replace blob URL with real remote URL
                    // This ensures ImageViewer uses the cacheable remote URL instead of the soon-to-be-revoked blob URL
                    setUploadingMessage(prev => prev.map(msg =>
                        msg.id === optMsg.id
                            ? {
                                ...msg,
                                attachments: msg.attachments.map(a =>
                                    a.file === att.file ? {
                                        ...a,
                                        url: fullUrl, // Update URL
                                        fileUrl: fullUrl, // Update fileUrl (Standard field used by MessageBubble)
                                        previewUrl: null, // Clear preview URL to force use of url
                                        uploadStatus: 'uploaded'
                                    } : a
                                )
                            }
                            : msg
                    ));

                    // CLEANUP: Revoke Original Blobs
                    // Now that we have cached what we need (Original or Compressed), we can revoke the initial preview blobs
                    // DELAY: We must delay revocation to allow React state updates (setUploadingMessage) to propagate
                    // and for the ImageViewer to switch to the new 'fullUrl'. If we revoke immediately,
                    // the UI might try to render the blob one last time and fail (ERR_FILE_NOT_FOUND).
                    setTimeout(() => {
                        if (att.previewUrl && att.previewUrl.startsWith('blob:')) {
                            releaseBlobUrl(att.file);
                        }
                        if (att.thumbnailUrl && att.thumbnailUrl.startsWith('blob:')) {
                            // Thumbnails are created from separate blobs (thumbResult.blob), 
                            // but we can't easily access the blob object here from the URL string unless we kept it.
                            // However, we rely on the registry's timeout.
                            // Ideally we should pass the blob to releaseBlobUrl.

                            // For now, if we can't reference the blob, we rely on GC 
                            // BUT wait, ChatWindow created it with acquireBlobUrl(thumbResult.blob).
                            // We need to release it. But we lost the blob reference in `attachments` array... 
                            // The `attachments` state only kept `thumbnailUrl` string and `thumbnailData`.

                            // Ah! `thumbnailData` has the blob!
                            if (att.thumbnailData?.blob) {
                                releaseBlobUrl(att.thumbnailData.blob);
                            } else {
                                // Fallback for safety if somehow lost (shouldn't happen with current logic)
                                URL.revokeObjectURL(att.thumbnailUrl);
                            }
                        }
                    }, 5000); // 5 seconds grace period

                    return {
                        status: 'fulfilled',
                        optMsgId: optMsg.id,
                        uploadedAtt: {
                            fileUrl: fullUrl, // Must be fullUrl to match IDB cache key
                            fileName: uploadData.storedName,
                            fileOrigin: att.file.name,
                            fileType: att.type,
                            fileSize: att.file.size,
                            meta, // Persist dimensions to backend
                            caption: att.type !== 'audio' ? (att.caption || '') : ''
                        }
                    };

                } catch (error) {
                    // Check if cancelled
                    if (error.name === 'CanceledError' || error.name === 'AbortError') {
                        return { status: 'cancelled', optMsgId: optMsg.id };
                    }

                    console.error(`Upload failed for ${att.file.name}:`, error);

                    // Show toast for specific errors
                    if (error.code === 'FILE_TOO_LARGE') {
                        toast({
                            variant: 'destructive',
                            title: 'File terlalu besar',
                            description: `File ${att.file.name} melebihi batas 50MB.`
                        });
                    } else if (error.code === 'RATE_LIMIT_EXCEEDED') {
                        toast({
                            variant: 'destructive',
                            title: 'Terlalu banyak permintaan',
                            description: `${error.message} (${error.retryAfter || 60} detik)`
                        });
                    }

                    return { status: 'rejected', optMsgId: optMsg.id, error };
                } finally {
                    // Cleanup controller
                    const key = `${optMsg.id}-${0}`;
                    delete uploadControllersRef.current[key];
                }
            });
        });

        // Wait for ALL uploads to finish (success or fail)
        const results = await Promise.all(uploadPromises);

        // Process results IN ORDER
        for (const result of results) {
            if (result.status === 'fulfilled') {
                // Success: Send message
                onSendMessage(result.uploadedAtt.caption || '', [result.uploadedAtt]);
                // Remove from optimistic state
                setUploadingMessage(prev => prev.filter(msg => msg.id !== result.optMsgId));
            } else if (result.status === 'cancelled') {
                // Cancelled: Just remove
                setUploadingMessage(prev => prev.filter(msg => msg.id !== result.optMsgId));
            } else {
                // Error: Mark as failed in UI
                setUploadingMessage(prev => prev.map(msg =>
                    msg.id === result.optMsgId
                        ? {
                            ...msg,
                            attachments: msg.attachments.map(a => ({ ...a, uploadStatus: 'error' }))
                        }
                        : msg
                ));

                // Auto-remove error after delay
                setTimeout(() => {
                    setUploadingMessage(prev => prev.filter(msg => msg.id !== result.optMsgId));
                }, 3000);
            }
        }
    }, [onSendMessage, handleCancelUpload]);

    // Memoize close handler
    const handleClosePreview = useCallback(() => {
        // Cleanup blobs to prevent memory leaks and network errors
        previewAttachment.forEach(att => {
            if (att.previewUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(att.previewUrl);
            }
            if (att.thumbnailUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(att.thumbnailUrl);
            }
        });
        setPreviewAttachment([]);
    }, [previewAttachment]);

    // Track if currently sending to prevent double-click
    const isSendingRef = useRef(false);

    const handleSend = async () => {
        const content = inputValue.trim();

        const hasPending = attachments.some(att => att.status === 'pending');
        if (!content && attachments.length === 0) return;

        // Force stop typing atomically before sending
        if (activeChat?.id) {
            stopAgentTyping();
        }

        // If only text (no attachments), send immediately (optimistic, no blocking)
        if (content && attachments.length === 0) {
            onSendMessage(content, []);
            setInputValue('');

            // Auto-scroll to bottom (Masked)
            setIsAutoScrolling(true);
            setTimeout(() => {
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
                // Clean up mask
                autoScrollReleaseDebouncer.current?.maybeExecute();
            }, 50);

            return;
        }

        // Has attachments - handle upload
        if (isSendingRef.current) return;
        isSendingRef.current = true;

        // Upload pending attachments
        const uploadedAttachments = [...attachments];
        let hasError = false;

        if (hasPending) {
            const updateAttachmentState = (id, updates) => {
                setAttachments(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
            };

            for (let i = 0; i < uploadedAttachments.length; i++) {
                const att = uploadedAttachments[i];
                if (att.status === 'pending') {
                    updateAttachmentState(att.id, { status: 'uploading', progress: 0 });

                    try {
                        const result = await uploadService.upload(att.file, att.type, (progress) => {
                            updateAttachmentState(att.id, { progress });
                        });

                        // Robust parsing helper
                        const findUploadData = (obj) => {
                            if (!obj || typeof obj !== 'object') return null;
                            if (obj.storedName || obj.urlPath || obj.fileName) return obj;
                            if (obj.data && typeof obj.data === 'object') {
                                if (obj.data.storedName || obj.data.urlPath || obj.data.fileName) return obj.data;
                            }
                            for (const key in obj) {
                                if (key !== 'data' && obj[key] && typeof obj[key] === 'object') {
                                    if (obj[key].storedName || obj[key].urlPath) return obj[key];
                                }
                            }
                            return null;
                        };

                        let uploadData = findUploadData(result);
                        if (!uploadData && result && typeof result === 'object' && !result.error) {
                            uploadData = result.data || result;
                        }

                        if (uploadData && (uploadData.storedName || uploadData.fileName || uploadData.urlPath)) {
                            // Extract Server URL
                            const finalUrl = uploadData.urlPath
                                ? (uploadData.urlPath.startsWith('http') ? uploadData.urlPath : `${config.apiUrl}${uploadData.urlPath}`)
                                : null;

                            // -------------------------------------------------------------------------
                            // UNIFIED CACHING STRATEGY (ALL TYPES)
                            // "Simpan cache untuk semua attachment (audio, video, image, document)"
                            // -------------------------------------------------------------------------
                            if (finalUrl && att.file) {
                                try {
                                    // 1. Cache ORIGINAL File
                                    // Memory Cache (QueryClient): ALWAYS cache for immediate access (Audio, Video, Doc, Image)
                                    // IDB Cache (Persistent): ONLY cache for IMAGES ("image akses cache blob di idb")
                                    // Video/Audio/Doc: Do NOT cache blob in IDB ("Jangan simpan blob asli di idb")
                                    queryClient.setQueryData(['attachment', finalUrl], att.file);

                                    let cacheOriginalPromise = Promise.resolve();
                                    if (att.type === 'image') {
                                        cacheOriginalPromise = set(finalUrl, att.file);
                                    }

                                    // 2. Prepare Metadata
                                    // Reuse pre-generated thumbnail/metadata from Preview Dialog
                                    // att.thumbnailData contains { blob, width, height }
                                    // att.meta contains { duration } (Audio/Video from onLoadedMetadata)
                                    const thumbData = att.thumbnailData || {};
                                    const metaData = att.meta || {};

                                    // If Image and no thumbnail, generate backup (blocking if needed)
                                    if (att.type === 'image' && !thumbData.blob) {
                                        try {
                                            const gen = await generateThumbnail(att.file);
                                            if (gen) Object.assign(thumbData, gen);
                                        } catch (err) { console.warn('Backup thumb gen failed'); }
                                    }

                                    // 3. Save Metadata (IDB)
                                    // Include logic for specific types
                                    const metadataToSave = {
                                        size: att.file.size,
                                        type: att.type, // Store explicit frontend type
                                        // Image/Video specifics
                                        thumbnail: thumbData.blob || null,
                                        width: thumbData.width || 0,
                                        height: thumbData.height || 0,
                                        originalWidth: thumbData.originalWidth || thumbData.width || 0,
                                        originalHeight: thumbData.originalHeight || thumbData.height || 0,
                                        // Audio/Video specifics (captured in Dialog)
                                        duration: metaData.duration || 0,
                                    };

                                    // Wait for blob cache safely
                                    await cacheOriginalPromise;

                                    // Save Meta
                                    await saveMetadata(finalUrl, metadataToSave);

                                } catch (e) {
                                    console.warn('[Upload] Unified Cache Failed', e);
                                }
                            }

                            // (Disabled Old Image Block)
                            if (false) {
                                try {
                                    // 1. Cache ORIGINAL File (IDB + Memory) - for ImageViewer
                                    queryClient.setQueryData(['attachment', finalUrl], att.file); // Immediate Memory
                                    const cacheOriginalPromise = set(finalUrl, att.file); // Background IDB

                                    // 2. Generate and Cache THUMBNAIL (Metadata) - for ImageAttachment
                                    // REUSE pre-generated thumbnail if available (from handleFileChange)
                                    let thumbResult = att.thumbnailData;

                                    if (!thumbResult) {
                                        // Fallback: Generate now if not present (Blocking)
                                        thumbResult = await generateThumbnail(att.file);
                                    }

                                    // Wait for original cache to ensure persistence before UI update
                                    await cacheOriginalPromise;

                                    if (thumbResult) {
                                        await saveMetadata(finalUrl, {
                                            thumbnail: thumbResult.blob,
                                            width: thumbResult.width,
                                            height: thumbResult.height,
                                            originalWidth: thumbResult.originalWidth,
                                            originalHeight: thumbResult.originalHeight,
                                            duration: 0,
                                            size: att.file.size
                                        });
                                    }
                                } catch (e) {
                                    console.warn('[Upload] Cache/Thumbnail generation failed', e);
                                }
                            }

                            // (Disabled Old Video Block)
                            if (false) {
                                try {
                                    // REUSE pre-generated thumbnail (from Preview Dialog)
                                    const thumbResult = att.thumbnailData;

                                    if (thumbResult && thumbResult.blob) {
                                        await saveMetadata(finalUrl, {
                                            thumbnail: thumbResult.blob,
                                            width: thumbResult.width,
                                            height: thumbResult.height,
                                            originalWidth: thumbResult.originalWidth || thumbResult.width,
                                            originalHeight: thumbResult.originalHeight || thumbResult.height,
                                            duration: 0, // Duration currently not captured explicitly
                                            size: att.file.size
                                        });
                                    }
                                } catch (e) {
                                    console.warn('[Upload] Video thumbnail cache failed', e);
                                }
                            }

                            uploadedAttachments[i] = { ...att, status: 'done', data: uploadData };
                            updateAttachmentState(att.id, { status: 'done', data: uploadData });

                            // OPTIMIZATION: Prime the IDB Cache immediately
                            // We have the blob and the remote URL. Map them so next fetch uses IDB.
                            if (finalUrl) {
                                try {
                                    // 1. Cache the File Blob under the Remote URL
                                    // Use original file or compressed blob if available
                                    const blobToCache = compressedFile || att.file;
                                    await set(finalUrl, blobToCache);

                                    // 2. Cache the Thumbnail Metadata if available
                                    // This prevents regenerating thumbnail from the cached blob
                                    if (att.thumbnailData?.blob) {
                                        await saveMetadata(finalUrl, {
                                            thumbnail: att.thumbnailData.blob,
                                            width: att.thumbnailData.width,
                                            height: att.thumbnailData.height,
                                            originalWidth: att.thumbnailData.originalWidth,
                                            originalHeight: att.thumbnailData.originalHeight,
                                            duration: att.meta?.duration || 0,
                                            size: blobToCache.size
                                        });
                                    }
                                } catch (e) {
                                    console.warn('[Upload] Failed to prime cache', e);
                                }
                            }
                        } else {
                            throw new Error('Upload returned invalid metadata');
                        }
                    } catch (error) {
                        console.error('Upload failed:', error);

                        // Show toast for specific errors
                        if (error.code === 'FILE_TOO_LARGE') {
                            toast({
                                variant: 'destructive',
                                title: 'File terlalu besar',
                                description: `File ${att.file.name} melebihi batas 50MB.`
                            });
                        } else if (error.code === 'RATE_LIMIT_EXCEEDED') {
                            toast({
                                variant: 'destructive',
                                title: 'Terlalu banyak permintaan',
                                description: `${error.message} (${error.retryAfter || 60} detik)`
                            });
                        }

                        updateAttachmentState(att.id, { status: 'error', error: error.message });
                        hasError = true;
                    }
                }
            }
        }

        if (hasError) {
            isSendingRef.current = false;
            return;
        }

        // Filter valid attachments
        const validAttachments = uploadedAttachments
            .filter(att => att.status === 'done' && att.data)
            .map(att => {
                const data = att.data || {};
                return {
                    fileOrigin: att.file.name,
                    fileName: data.storedName || data.fileName || att.file.name,
                    fileType: data.fileType || att.type || 'document',
                    fileUrl: data.urlPath || data.path || '',
                    fileSize: data.fileSize || data.size || 0,
                    meta: data.meta // Pass backend metadata (width/height)
                };
            });

        // Send message
        onSendMessage(content, validAttachments);

        // Auto-scroll to bottom (Masked)
        setIsAutoScrolling(true);
        setTimeout(() => {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            autoScrollReleaseDebouncer.current?.maybeExecute();
        }, 50);

        setAttachments([]);
        setInputValue('');

        isSendingRef.current = false;
    };

    // ============================================================
    // CHARACTER LIMIT (Grapheme-based for accurate emoji counting)
    // ============================================================
    const MAX_MESSAGE_LENGTH = 500;

    // Helper: Count graphemes (visual characters) using Intl.Segmenter
    const getGraphemeCount = (text) => {
        if (!text) return 0;
        try {
            const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
            return [...segmenter.segment(text)].length;
        } catch (e) {
            // Fallback: spread operator (less accurate for complex emojis)
            return [...text].length;
        }
    };

    // Current character count (memoized for performance)
    const charCount = useMemo(() => getGraphemeCount(inputValue), [inputValue]);

    // Auto-resize textarea when inputValue changes or clears
    useLayoutEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'; // Reset to auto to shrink if needed
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`; // Grow up to max height
        }
    }, [inputValue]);

    // Permission Logic
    const isOwner = activeChat && currentUser && activeChat.agentHandle === String(currentUser.id);
    const isAdmin = currentUser?.role === 'admin';
    const isHandler = isOwner;
    const isUnhandled = activeChat && activeChat.waitingAgent;
    const isOtherHandler = activeChat && !isUnhandled && !isHandler;

    // Initialize Debouncers and Throttlers
    const typingEndDebouncer = useRef(null);
    const scrollEndDebouncer = useRef(null);
    const autoScrollReleaseDebouncer = useRef(null);
    const scrollThrottler = useRef(null);

    useEffect(() => {
        // Typing Debouncer: Stops agent typing after 2000ms of inactivity
        typingEndDebouncer.current = new Debouncer(
            () => {
                if (isAgentTypingRef.current && activeChat?.id && isHandler) {
                    socket.emit('agent:typing', {
                        interactionId: activeChat.id,
                        isTyping: false,
                        agentName: currentUser.name,
                        agentId: currentUser.id,
                        agentRole: currentUser.role
                    });
                    isAgentTypingRef.current = false;
                }
            },
            { wait: 2000 }
        );

        // Scroll End Debouncer: Smoothly hide Date Header after scrolling stops
        scrollEndDebouncer.current = new Debouncer(
            () => {
                setIsScrolling(false);
            },
            { wait: 1500 }
        );

        // Auto Scroll Mask Release Debouncer: Removes auto-scroll mask after programmatic scroll
        autoScrollReleaseDebouncer.current = new Debouncer(
            () => {
                setIsAutoScrolling(false);
            },
            { wait: 700 }
        );

        // Scroll Throttler: Efficiently detects if scrolled to bottom
        scrollThrottler.current = new Throttler(
            (scrollTop, scrollHeight, clientHeight) => {
                const atBottom = scrollHeight - scrollTop - clientHeight < 50;
                setIsAtBottom(atBottom);

                if (fabCooldownRef.current && atBottom) {
                    fabCooldownRef.current = false;
                    setShowFab(false);
                } else {
                    setShowFab(!atBottom);
                }

                setIsScrolling(true);
                scrollEndDebouncer.current?.maybeExecute();
            },
            { wait: 50 }
        );

        return () => {
            typingEndDebouncer.current?.cancel();
            scrollEndDebouncer.current?.cancel();
            autoScrollReleaseDebouncer.current?.cancel();
            scrollThrottler.current?.cancel();
        };
    }, [activeChat?.id, currentUser, isHandler]);

    // Simple typing emission
    const emitAgentTyping = useCallback((hasText) => {
        if (!activeChat?.id || !isHandler) return;

        // Cancel pending stop timer
        typingEndDebouncer.current?.cancel();

        if (hasText) {
            // Emit "start" only once
            if (!isAgentTypingRef.current) {
                socket.emit('agent:typing', {
                    interactionId: activeChat.id,
                    isTyping: true,
                    agentName: currentUser.name,
                    agentId: currentUser.id,
                    agentRole: currentUser.role
                });
                isAgentTypingRef.current = true;
            }
            // Schedule the stop (debounced)
            typingEndDebouncer.current?.maybeExecute();
        } else {
            // Empty input -> Stop immediately
            if (isAgentTypingRef.current) {
                socket.emit('agent:typing', {
                    interactionId: activeChat.id,
                    isTyping: false,
                    agentName: currentUser.name,
                    agentId: currentUser.id,
                    agentRole: currentUser.role
                });
                isAgentTypingRef.current = false;
            }
        }
    }, [activeChat?.id, isHandler, currentUser]);

    // Force stop typing immediately (for when message is sent)
    const stopAgentTyping = useCallback(() => {
        typingEndDebouncer.current?.cancel();
        if (isAgentTypingRef.current && activeChat?.id) {
            socket.emit('agent:typing', {
                interactionId: activeChat.id,
                isTyping: false,
                agentName: currentUser.name,
                agentId: currentUser.id,
                agentRole: currentUser.role
            });
            isAgentTypingRef.current = false;
        }
    }, [activeChat?.id, currentUser]);

    // Ref to track if we've already captured initial unread state for current chat
    const hasInitialUnreadCapturedRef = useRef(false);

    // Reset Unread Divider & Scroll State when chat changes
    useEffect(() => {
        if (activeChat?.id) {
            setShowUnreadDivider(true);
            setShowEmojiPicker(false); // Close emoji picker on chat switch
            hasInitialScrolledRef.current = false; // Reset scroll tracker
            setIsScrollReady(false); // Hide content until scrolled
            lastChatIdRef.current = activeChat.id;
            setIsAtBottom(true); // Reset scroll position
            setShowFab(false); // Hide FAB initially

            // Reset capture flag for new chat
            hasInitialUnreadCapturedRef.current = false;
            // Reset initial values (will be captured on first valid messages load)
            initialUnreadCountRef.current = 0;
            initialFirstUnreadIndexRef.current = -1;

            // Clear any pending hide timer
            if (unreadHideTimeout.current) {
                clearTimeout(unreadHideTimeout.current);
                unreadHideTimeout.current = null;
            }
        }
    }, [activeChat?.id]);

    // Capture initial unread state ONCE when messages first become available
    // This runs separately to handle the race condition where messages load after chat switch
    useEffect(() => {
        // Only capture once per chat, and only when we have messages
        if (
            activeChat?.id &&
            messages?.length > 0 &&
            !hasInitialUnreadCapturedRef.current
        ) {
            // Capture initial unread count for this chat
            const visitorUnread = messages.filter(m => m.sender === 'visitor' && m.status !== 'read').length;
            initialUnreadCountRef.current = visitorUnread;

            // Capture initial first unread index (for UnreadDivider positioning)
            const firstIdx = messages.findIndex(m => m.sender === 'visitor' && m.status !== 'read');
            initialFirstUnreadIndexRef.current = firstIdx;

            // Mark as captured so we don't overwrite when messages update (status changes, new messages)
            hasInitialUnreadCapturedRef.current = true;

            console.log('[ChatWindow] Captured initial unread state:', {
                count: visitorUnread,
                firstIdx,
                chatId: activeChat.id
            });
        }
    }, [activeChat?.id, messages]);

    // Prefetch attachments in adjacent messages (Audit Recommendation 3)
    useEffect(() => {
        if (!messages?.length) return;

        // Take last 10 messages to prefetch their attachments (User Request: 5 previous/next -> ~10 recent)
        const recentMessages = messages.slice(-10);

        recentMessages.forEach(msg => {
            if (msg.attachments?.length) {
                msg.attachments.forEach(att => {
                    const url = att.url || (att.path ? `${config.apiUrl}${att.path}` : null);
                    // Infer type if not explicit
                    const type = att.type || (att.file?.type?.startsWith('image/') ? 'image' : 'file');

                    if (url) {
                        prefetchAttachment(queryClient, url, type);
                    }
                });
            }
        });
    }, [messages, queryClient]);

    // Handle Click Outside Emoji Picker
    useEffect(() => {
        function handleClickOutside(event) {
            if (showEmojiPicker && emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
                if (!event.target.closest('button')) {
                    setShowEmojiPicker(false);
                }
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showEmojiPicker]);

    // Smart Unread Divider Hide: IntersectionObserver + Debounce
    useEffect(() => {
        // Small delay to ensure ref is attached after render
        const timer = setTimeout(() => {
            if (!unreadRef.current || !showUnreadDivider) return;

            const observer = new IntersectionObserver(
                ([entry]) => {
                    if (!entry.isIntersecting) {
                        // Divider is OUT of view - start hide timer
                        if (!unreadHideTimeout.current) {
                            unreadHideTimeout.current = setTimeout(() => {
                                setShowUnreadDivider(false);
                                unreadHideTimeout.current = null;
                            }, 3000); // Hide after 3s out of view
                        }
                    } else {
                        // Divider is IN view - cancel any pending hide
                        if (unreadHideTimeout.current) {
                            clearTimeout(unreadHideTimeout.current);
                            unreadHideTimeout.current = null;
                        }
                    }
                },
                { threshold: 0.1 } // Trigger when 10% visible/hidden
            );

            observer.observe(unreadRef.current);

            // Store observer for cleanup
            unreadRef._observer = observer;
        }, 100); // Small delay for DOM to be ready

        return () => {
            clearTimeout(timer);
            if (unreadRef._observer) {
                unreadRef._observer.disconnect();
            }
            if (unreadHideTimeout.current) {
                clearTimeout(unreadHideTimeout.current);
            }
        };
    }, [showUnreadDivider, activeChat?.id]);

    // IntersectionObserver for marking messages as read when visible
    useEffect(() => {
        // Robust Check: Only the assigned handler can mark messages as read
        // nullify the observer if they aren't authorized to prevent stale closures reviving it
        if (!activeChat?.id || !isHandler) {
            if (messageObserverRef.current) {
                messageObserverRef.current.disconnect();
                messageObserverRef.current = null;
            }
            return;
        }

        // Reset sent receipts when chat changes
        if (lastChatIdRef.current !== activeChat.id) {
            sentReadReceipts.current = new Set();
        }

        const scrollContainer = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
        if (!scrollContainer) return;

        // Create observer for message visibility
        messageObserverRef.current = new IntersectionObserver(
            (entries) => {
                const messageIdsToMark = [];

                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const msgId = entry.target.getAttribute('data-msg-id');
                        const sender = entry.target.getAttribute('data-sender');
                        const status = entry.target.getAttribute('data-status');

                        // Only mark unread visitor messages
                        if (
                            sender === 'visitor' &&
                            status !== 'read' &&
                            msgId &&
                            !sentReadReceipts.current.has(msgId)
                        ) {
                            messageIdsToMark.push(msgId);
                            sentReadReceipts.current.add(msgId);
                        }
                    }
                });

                // Batch emit to backend
                if (messageIdsToMark.length > 0) {
                    socket.emit('agent:mark_read', {
                        interactionId: activeChat.id,
                        messageIds: messageIdsToMark
                    });
                    console.log('[ChatWindow] Marking visible messages as read:', messageIdsToMark);
                }
            },
            {
                root: scrollContainer,
                threshold: 0.5 // Trigger when 50% visible
            }
        );

        // Explicitly observe existing unread messages.
        // This is necessary because if isHandler changes to true, the observer is recreated,
        // but the ref callbacks on existing DOM elements won't re-run.
        const unreadMessages = scrollContainer.querySelectorAll('[data-status="unread"][data-sender="visitor"]');
        unreadMessages.forEach(el => messageObserverRef.current.observe(el));

        return () => {
            if (messageObserverRef.current) {
                messageObserverRef.current.disconnect();
                messageObserverRef.current = null;
            }
        };
    }, [activeChat?.id, isHandler]);

    // Listen for customer typing events
    const customerTypingGracePeriodRef = useRef(null);

    useEffect(() => {
        if (!activeChat?.id) {
            setIsCustomerTyping(false);
            if (customerTypingGracePeriodRef.current) {
                clearTimeout(customerTypingGracePeriodRef.current);
            }
            return;
        }

        const handleCustomerTyping = ({ interactionId, isTyping }) => {
            if (interactionId === activeChat.id) {
                if (isTyping) {
                    if (customerTypingGracePeriodRef.current) {
                        clearTimeout(customerTypingGracePeriodRef.current);
                        customerTypingGracePeriodRef.current = null;
                    }
                    setIsCustomerTyping(true);
                } else {
                    // Grace Period (1.5s): Prevents UI jumping by keeping the typing indicator alive.
                    // If a message arrives shortly after, the Atomic Sync securely instantly removes it 
                    // without it ever fading out first.
                    if (customerTypingGracePeriodRef.current) {
                        clearTimeout(customerTypingGracePeriodRef.current);
                    }
                    customerTypingGracePeriodRef.current = setTimeout(() => {
                        setIsCustomerTyping(false);
                        customerTypingGracePeriodRef.current = null;
                    }, 1500);
                }
            }
        };

        socket.on('customer:typing', handleCustomerTyping);

        return () => {
            socket.off('customer:typing', handleCustomerTyping);
            setIsCustomerTyping(false);
            if (customerTypingGracePeriodRef.current) {
                clearTimeout(customerTypingGracePeriodRef.current);
            }
        };
    }, [activeChat?.id, socket]);

    const handleScroll = (e) => {
        // Immediate Interaction Cancel: cancel auto-scrolling on manual user scroll
        setIsAutoScrolling(false);
        autoScrollReleaseDebouncer.current?.cancel();

        const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
        if (!viewport) return;

        // Pass to Throttler continuously
        const { scrollTop, scrollHeight, clientHeight } = viewport;
        scrollThrottler.current?.maybeExecute(scrollTop, scrollHeight, clientHeight);

        // Date Separator Detection (Using rAF for layout thrashing protection)
        if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(() => {
                const dateSeparators = viewport.querySelectorAll('[data-date-label]');
                let currentDate = null;

                dateSeparators.forEach((el) => {
                    const rect = el.getBoundingClientRect();
                    const viewportRect = viewport.getBoundingClientRect();
                    if (rect.top <= viewportRect.top + 50) {
                        currentDate = el.getAttribute('data-date-label');
                    }
                });

                if (currentDate !== currentStickyDateRef.current) {
                    currentStickyDateRef.current = currentDate;
                    setCurrentStickyDate(currentDate);
                }

                rafRef.current = null;
            });
        }
    };

    // Smart Scroll Logic (Industry Standard: Synchronous scroll in useLayoutEffect)
    // This runs BEFORE browser paint, ensuring instant positioning without flicker
    useLayoutEffect(() => {
        if (!messages.length || !activeChat) return;

        // Use queueMicrotask to ensure DOM elements are rendered but still before paint
        queueMicrotask(() => {
            const scrollContainer = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
            if (!scrollContainer) {
                setIsScrollReady(true);
                return;
            }

            const isInitialLoad = !hasInitialScrolledRef.current;
            const hasUnread = messages.some(m => m.sender === 'visitor' && m.status !== 'read');

            if (isInitialLoad) {
                if (hasUnread && unreadRef.current) {
                    // Scroll to center unread divider - INSTANT (no animation)
                    unreadRef.current.scrollIntoView({ block: 'center', behavior: 'instant' });
                } else {
                    // Scroll to bottom - INSTANT
                    scrollContainer.scrollTop = scrollContainer.scrollHeight;
                }
                hasInitialScrolledRef.current = true;
                setIsScrollReady(true);
            }
        });

        // Safety fallback
        const safetyTimeout = setTimeout(() => {
            if (!hasInitialScrolledRef.current) {
                setIsScrollReady(true);
            }
        }, 150);

        return () => clearTimeout(safetyTimeout);
    }, [messages, activeChat?.id]);

    // Calculate unread count for the divider label
    const unreadCount = messages.filter(m => m.sender === 'visitor' && m.status !== 'read').length;

    // Find the index of the first unread message
    const firstUnreadIndex = messages.findIndex(m => m.sender === 'visitor' && m.status !== 'read');

    // Show FAB if not at bottom, have unreads, and NOT masking auto-scroll
    useEffect(() => {
        // Skip if in cooldown (just clicked FAB)
        if (fabCooldownRef.current) return;

        const shouldShowFab = (!isAtBottom || unreadCount > 0) && !isAutoScrolling;
        setShowFab(shouldShowFab);
    }, [messages.length, unreadCount, isAtBottom, isAutoScrolling]);

    // Auto-scroll to bottom AND Atomic Type-Clearing when new messages arrive
    const prevMessageCountRef = useRef(messages.length);
    useEffect(() => {
        if (messages.length > prevMessageCountRef.current) {
            const latestMessage = messages[messages.length - 1];

            // 1. ATOMIC SYNC: Force clear typing indicator exactly when Widget's message arrives
            // This fixes the sync race condition where Widget is typing, sends a message, but typing indicator stays.
            if (latestMessage && latestMessage.sender === 'visitor') {
                if (customerTypingGracePeriodRef.current) {
                    clearTimeout(customerTypingGracePeriodRef.current);
                    customerTypingGracePeriodRef.current = null;
                }
                setIsCustomerTyping(false);
            }
            
            // 2. Auto Scroll if at bottom
            if (isAtBottom) {
                setIsAutoScrolling(true);
                bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
                autoScrollReleaseDebouncer.current?.maybeExecute();
            }
        }
        prevMessageCountRef.current = messages.length;
    }, [messages, isAtBottom]);

    // Auto-scroll when typing indicator appears (only if at bottom)
    useEffect(() => {
        if (isCustomerTyping && isAtBottom) {
            setIsAutoScrolling(true);
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            autoScrollReleaseDebouncer.current?.maybeExecute();
        }
    }, [isCustomerTyping, isAtBottom]);

    // Group messages by date label for sticky section headers
    const groupedMessages = useMemo(() => {
        const groups = {};
        messages.forEach(msg => {
            // ... existing code ...
            const dateLabel = getDateLabel(msg.timestamp || msg.createdAt);
            if (!groups[dateLabel]) {
                groups[dateLabel] = [];
            }
            groups[dateLabel].push(msg);
        });
        return groups;
    }, [messages]);

    // Capture ScrollArea viewport for IntersectionObserver root
    const [scrollViewport, setScrollViewport] = useState(null);

    return (
        <Card
            className="flex-1 min-w-0 flex flex-col bg-slate-800 rounded-md border-2 border-slate-800 overflow-hidden shadow-sm relative p-0"
            {...dragHandlers}
        >
            {/* Drag and Drop Overlay */}
            {isDragging && (
                <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary m-4 rounded-xl flex items-center justify-center pointer-events-none">
                    <div className="flex flex-col items-center justify-center text-primary animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-4 rounded-full bg-primary/10 mb-4">
                            <CloudUpload className="h-12 w-12" />
                        </div>
                        <h3 className="text-xl font-semibold">Drop files here</h3>
                        <p className="text-muted-foreground text-sm mt-1">Add attachments to chat</p>
                    </div>
                </div>
            )}
            {activeChat ? (
                <>
                    {/* Header */}
                    <CardHeader className="h-16 border-b-2 border-slate-800 flex flex-row items-center justify-between px-6 py-0 bg-slate-900/95 backdrop-blur-sm z-10 space-y-0">
                        {/* ... existing header code ... */}
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <Avatar className="h-9 w-9">
                                    <AvatarFallback className={`${getAvatarColor(activeChat.name)} text-white font-semibold text-sm`}>
                                        {getInitials(activeChat.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-slate-900"></span>
                            </div>
                            <div>
                                <h3 className="font-semibold text-sm text-slate-100">{activeChat.name}</h3>
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <span>Customer • via {activeChat.channel || 'Website'}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                            {/* Handle / Close Actions in Header */}
                            {(isUnhandled || (isAdmin && isOtherHandler)) && (
                                <Button size="sm" onClick={() => onHandleChat(activeChat.id)} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                                    Handle Chat
                                </Button>
                            )}

                            {(isHandler || (isAdmin && isOtherHandler)) && (
                                <Button size="sm" onClick={() => onCloseChat(activeChat.id)} className="bg-red-600 hover:bg-red-700 text-white shadow-sm">
                                    Close Chat
                                </Button>
                            )}

                            {isOtherHandler && (
                                <div className="px-3 py-1 bg-slate-800 rounded-full text-xs text-slate-400 border border-slate-700">
                                    Viewing {activeChat.agentName || activeChat.agentHandle || 'Chat'}
                                </div>
                            )}

                            <div className="h-6 w-px bg-slate-800 mx-1" />
                            {/* Transfer Button - Only for Handlers */}
                            {(isHandler || (isAdmin && isOtherHandler)) && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Transfer Chat"
                                    onClick={() => setShowTransferDialog(true)}
                                    className="hover:text-amber-400 hover:bg-slate-800 rounded-lg mr-1"
                                >
                                    <ChevronsDown className="h-5 w-5 rotate-90" />
                                </Button>
                            )}
                            <Button variant="ghost" size="icon" className="hover:text-slate-100 hover:bg-slate-800 rounded-lg"><MoreVertical className="h-5 w-5" /></Button>
                        </div>
                    </CardHeader>

                    {/* Transfer Dialog */}
                    <TransferChatDialog
                        open={showTransferDialog}
                        onOpenChange={setShowTransferDialog}
                        activeChat={activeChat}
                        onTransfer={handleTransferChat}
                    />

                    {/* ScrollArea ... existing code ... */}
                    <ScrollArea ref={scrollAreaRef} viewportRef={setScrollViewport} className="flex-1 bg-slate-900" onScrollCapture={handleScroll}>
                        <div className="p-6">
                            {Object.entries(groupedMessages).map(([dateLabel, groupMessages], groupIdx) => (
                                <div key={dateLabel} className="relative pb-2">
                                    {/* Sticky Date Header for the Group */}
                                    <DateSeparator label={dateLabel} visible={isScrolling} root={scrollViewport} />

                                    {/* Messages in this Group */}
                                    <div className="flex flex-col">
                                        {groupMessages.map((msg, idx) => {
                                            // Determine global index for unread logic
                                            const globalIndex = messages.findIndex(m => m.id === msg.id);
                                            // Use INITIAL first unread index (captured when chat opened)
                                            const isFirstUnread = globalIndex === initialFirstUnreadIndexRef.current;
                                            const prevMsg = groupMessages[idx - 1];
                                            const nextMsg = groupMessages[idx + 1];

                                            const isFirstInGroup = !prevMsg || prevMsg.sender !== msg.sender;
                                            const isLastInGroup = !nextMsg || nextMsg.sender !== msg.sender;

                                            return (
                                                <Fragment key={msg.id || idx}>
                                                    {/* Unread Divider - only shows on initial chat open */}
                                                    {isFirstUnread && showUnreadDivider && initialUnreadCountRef.current > 0 && (
                                                        <UnreadDivider ref={unreadRef} count={initialUnreadCountRef.current} />
                                                    )}

                                                    {/* Message wrapper with data attributes for read tracking */}
                                                    <div
                                                        data-msg-id={msg.id}
                                                        data-sender={msg.sender}
                                                        data-status={msg.status}
                                                        ref={(el) => {
                                                            // Register with observer only for unread visitor messages
                                                            if (el && messageObserverRef.current && msg.sender === 'visitor' && msg.status !== 'read') {
                                                                messageObserverRef.current.observe(el);
                                                            }
                                                        }}
                                                    >
                                                        <MessageBubble
                                                            message={msg}
                                                            senderName={msg.senderName || (msg.sender === 'bot' ? activeChat.botName : activeChat.name)}
                                                            isAgent={msg.sender === 'agent' || msg.sender === 'bot'}
                                                            senderType={msg.sender}
                                                            isFirstInGroup={isFirstInGroup}
                                                            isLastInGroup={isLastInGroup}
                                                            isFirstUnread={isFirstUnread}
                                                            unreadCount={unreadCount}
                                                            unreadRef={isFirstUnread ? unreadRef : null}
                                                            showDateHeader={false}
                                                            currentUser={currentUser}
                                                        />
                                                    </div>
                                                </Fragment>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                            {/* Typing Indicator */}
                            {isCustomerTyping && <TypingIndicator name={activeChat?.name || 'Customer'} isVisible={true} />}

                            {/* Uploading Messages (Optimistic) */}
                            {Array.isArray(uploadingMessage) && uploadingMessage.map((msg, idx) => (
                                <MessageBubble
                                    key={msg.id}
                                    message={msg}
                                    senderName={currentUser?.name || 'Agent'}
                                    isAgent={true}
                                    senderType="agent"
                                    isFirstInGroup={idx === 0}
                                    isLastInGroup={idx === uploadingMessage.length - 1}
                                    isOwnMessage={true}
                                    showAvatar={true}
                                    currentUser={currentUser}
                                    getInitials={getInitials}
                                    getAvatarColor={getAvatarColor}
                                    formatTime={() => 'Sending...'}
                                />
                            ))}

                            <div ref={bottomRef} /><div ref={externalBottomRef} />
                        </div>
                    </ScrollArea>

                    {/* Scroll-to-bottom FAB with Unread Badge */}
                    {showFab && (
                        <div className="absolute bottom-[160px] right-3 z-10 animate-in fade-in duration-300 cursor-pointer">
                            <Button
                                onClick={() => {
                                    // Set cooldown - will be cleared when scroll reaches bottom
                                    fabCooldownRef.current = true;
                                    setShowFab(false);
                                    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
                                }}
                                size="icon"
                                className="relative bg-slate-700 hover:bg-slate-600 text-white rounded-full w-8 h-8 shadow-lg transition-all duration-200 hover:scale-105"
                            >
                                <ChevronsDown className="h-4 w-4" />
                                {/* Unread Badge */}
                                {unreadCount > 0 && !isAtBottom && (
                                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                )}
                            </Button>
                        </div>
                    )}

                    {/* Input Area */}
                    <CardFooter className="p-3 bg-slate-900 border-t-2 border-slate-800 flex-col items-stretch gap-2">
                        {/* Quick Reply */}
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                            <Badge variant="outline" className="cursor-pointer hover:bg-slate-800 font-normal py-1.5 px-3 rounded-full flex gap-1 text-slate-400 border-slate-700">
                                Quick Reply
                            </Badge>
                        </div>

                        {/* Input Container - Always visible but DISABLED if not owner */}
                        <div className={`bg-slate-800 rounded-lg px-2 py-1.5 flex flex-col justify-center ${isHandler ? '' : 'opacity-60 pointer-events-none'}`}>
                            <ScrollArea className="w-full max-h-[60px] mb-2 pt-1">
                                <textarea
                                    ref={textareaRef}
                                    placeholder={isHandler ? "Type your message here..." : (isUnhandled ? "Claim chat to reply" : "Preview Mode (Read Only)")}
                                    className="bg-transparent border-0 focus:ring-0 shadow-none px-1 w-full text-sm leading-5 text-slate-200 placeholder:text-slate-500 resize-none overflow-hidden min-h-[20px] focus:outline-none py-0 block"
                                    value={inputValue}
                                    onPaste={handlePaste}
                                    onChange={(e) => {
                                        const newValue = e.target.value;
                                        // Enforce character limit (grapheme-based)
                                        if (getGraphemeCount(newValue) <= MAX_MESSAGE_LENGTH) {
                                            setInputValue(newValue);
                                            // Emit typing event
                                            emitAgentTyping(newValue.trim().length > 0);
                                        }
                                        // Reset height to auto to get correct scrollHeight, then set
                                        e.target.style.height = 'auto';
                                        e.target.style.height = `${e.target.scrollHeight}px`;
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSend();
                                        }
                                    }}
                                    disabled={!isHandler}
                                    rows={1}
                                />
                            </ScrollArea>

                            {/* Action Bar */}
                            <div className="flex items-center justify-between w-full relative pl-1">
                                {/* Emoji Picker Popover */}
                                {showEmojiPicker && (
                                    <div className="absolute bottom-full left-0 mb-12 z-50 shadow-2xl" ref={emojiPickerRef}>
                                        <Picker
                                            data={data}
                                            theme="dark"
                                            onEmojiSelect={(emoji) => {
                                                // Enforce character limit when adding emoji
                                                const newValue = inputValue + emoji.native;
                                                if (getGraphemeCount(newValue) <= MAX_MESSAGE_LENGTH) {
                                                    setInputValue(newValue);
                                                }
                                                // Keep focus on textarea for continued typing
                                                textareaRef.current?.focus();
                                            }}
                                            previewPosition="none"
                                        />
                                    </div>
                                )}

                                {/* Left Icons */}
                                <div className="flex items-center gap-1">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                disabled={!isHandler}
                                                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                                className={`h-8 w-8 transition-colors rounded-lg ${showEmojiPicker ? 'text-blue-400 bg-blue-900/30' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'}`}
                                            >
                                                <Smile className="h-5 w-5" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Emoji</TooltipContent>
                                    </Tooltip>

                                    {/* Attachment Buttons */}
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                disabled={!isHandler}
                                                onClick={() => handleFileClick('image')}
                                                className="h-8 w-8 text-slate-500 hover:text-slate-300 hover:bg-slate-700 rounded-lg"
                                            >
                                                <Image className="h-5 w-5" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Gambar & Video</TooltipContent>
                                    </Tooltip>

                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                disabled={!isHandler}
                                                onClick={() => handleFileClick('audio')}
                                                className="h-8 w-8 text-slate-500 hover:text-slate-300 hover:bg-slate-700 rounded-lg"
                                            >
                                                <Mic className="h-5 w-5" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Audio</TooltipContent>
                                    </Tooltip>

                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                disabled={!isHandler}
                                                onClick={() => handleFileClick('document')}
                                                className="h-8 w-8 text-slate-500 hover:text-slate-300 hover:bg-slate-700 rounded-lg"
                                            >
                                                <Paperclip className="h-5 w-5" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Dokumen</TooltipContent>
                                    </Tooltip>

                                    {/* Hidden File Input */}
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        onChange={handleFileChange}
                                    />
                                </div>

                                {/* Character Counter + Send Button */}
                                <div className="flex items-center gap-2">
                                    {/* Character Counter */}
                                    {charCount > 0 && (
                                        <span className={`text-[10px] font-medium tabular-nums ${charCount >= MAX_MESSAGE_LENGTH
                                            ? 'text-red-400'
                                            : charCount >= MAX_MESSAGE_LENGTH * 0.9
                                                ? 'text-amber-400'
                                                : 'text-slate-500'
                                            } `}>
                                            {charCount}/{MAX_MESSAGE_LENGTH}
                                        </span>
                                    )}

                                    {/* Send Button */}
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={handleSend}
                                                disabled={!isHandler || ((!inputValue.trim()) && attachments.length === 0)}
                                                className={`h-8 w-8 rounded-lg transition-colors ${(!isHandler || ((!inputValue.trim()) && attachments.length === 0))
                                                    ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'
                                                    : 'text-blue-400 hover:text-blue-300 bg-blue-900/30 hover:bg-blue-900/50'
                                                    }`}
                                            >
                                                <Send className="h-5 w-5" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Kirim</TooltipContent>
                                    </Tooltip>
                                </div>
                            </div>
                        </div>
                    </CardFooter>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-slate-50 dark:bg-slate-950/50">
                    <div className="h-20 w-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6 shadow-sm">
                        <MessageSquare className="h-10 w-10 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">No Chat Selected</h3>
                    <p className="max-w-xs text-center text-sm">Select a conversation from the list to view details and start chatting.</p>
                </div>
            )
            }

            {/* Attachment Preview Dialog */}
            {
                previewAttachment.length > 0 && (
                    <AttachmentPreviewDialog
                        attachments={previewAttachment}
                        onSend={handlePreviewSend}
                        onClose={handleClosePreview}
                        onUpdateAttachment={handleUpdateAttachment}
                        onAddAttachment={handleAddAttachment}
                        onRemoveAttachment={handleRemovePreviewAttachment}
                    />
                )
            }
        </Card >
    );
};

export default ChatWindow;
