import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarColor, getInitials } from '@/utils/avatar';
import { formatTime } from '@/utils/formatUtils';
import { getRoleStyles } from '@/utils/roleStyles';
import { Bot, Clock, Check, CheckCheck, FileText, Download, Image as ImageIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { config } from '@/config';
import ImageViewer from './attachments/ImageViewer';
import ImageAttachment from './attachments/ImageAttachment';
import VideoPlayer from './attachments/VideoPlayer';
import VideoThumbnail from './attachments/VideoThumbnail';
import AudioPlayer from './attachments/AudioPlayer';
import DocumentAttachment from './attachments/DocumentAttachment';
import LocationAttachment from './attachments/LocationAttachment';
import {
    MIME_PREFIX_IMAGE,
    MIME_PREFIX_VIDEO,
    MIME_PREFIX_AUDIO,
    IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS,
    AUDIO_EXTENSIONS,
    DOCUMENT_EXTENSIONS,
    MIME_TYPE_PDF
} from '@/constants/fileTypes';

const MESSAGE_MAX_LENGTH = 300;

/**
 * MessageBubble Component
 * 
 * Displays a chat message with grouping support:
 * - Sender name (shown only on first message of group)
 * - Avatar (shown only on first message of group)
 * - Multi-line auto wrap
 * - "Read more..." for long messages
 * - Reduced spacing for consecutive messages from same sender
 * 
 * @param {Object} props
 * @param {Object} props.message - Message object with content, sender, timestamp
 * @param {string} props.senderName - Display name of the sender
 * @param {boolean} props.isAgent - Whether this message is from the agent
 * @param {boolean} props.isFirstInGroup - Whether this is the first message in a group
 * @param {boolean} props.isLastInGroup - Whether this is the last message in a group
 */
const MessageBubble = ({
    message,
    senderName,
    isAgent,
    senderType = 'visitor', // 'visitor', 'agent', 'bot'
    isFirstInGroup = true,
    isLastInGroup = true,
    currentUser, // Added for mention highlighting logic
    compact = false, // Added for Broadcast Chat smaller bubbles
    maxWidth = 'max-w-[70%]', // Added for customizable bubble width
    isTyping = false, // Added for mirroring Widget's native typing indicator
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const [selectedVideo, setSelectedVideo] = useState(null);

    // Dynamic Bubble Width State
    const [mediaWidths, setMediaWidths] = useState({});

    // Callback from child attachments (Image/Video/Audio/Doc/Location) to report their rendered width
    const handleMediaResize = useCallback((index, width) => {
        setMediaWidths(prev => {
            if (prev[index] === width) return prev;
            return { ...prev, [index]: width };
        });
    }, []);

    // Calculate max width from all reported media
    // Padding compensation: bubble uses px-2 (8px/side) and attachments use -mx-1 (4px/side)
    // Net padding = (8 - 4) * 2 = 8px. With border-box, width includes padding.
    const BUBBLE_PADDING_COMPENSATION = 8;
    const bubbleStyle = useMemo(() => {
        const widths = Object.values(mediaWidths);
        if (widths.length > 0) {
            const maxMediaWidth = Math.max(...widths);
            if (maxMediaWidth > 0) {
                return { width: `${maxMediaWidth + BUBBLE_PADDING_COMPENSATION}px`, maxWidth: '100%' };
            }
        }
        return {};
    }, [mediaWidths]);

    // EFFECT: Sync selectedImage with updated message attachments
    // EFFECT: Sync selectedImage with updated message attachments
    useEffect(() => {
        if (!selectedImage || !message.attachments) return;

        // 1. Try exact match by fileName/fileOrigin
        let matchingAtt = message.attachments.find(att =>
            (att.fileOrigin === selectedImage.fileName) ||
            (att.fileName === selectedImage.fileName)
        );

        // 2. Fallback: If only one attachment, assume it's the one (Robustness for single file uploads)
        if (!matchingAtt && message.attachments.length === 1) {
            matchingAtt = message.attachments[0];
        }

        if (matchingAtt) {
            let newUrl = matchingAtt.fileUrl || '';
            // Ensure full URL if relative
            if (newUrl && !newUrl.startsWith('http') && !newUrl.startsWith('blob:') && !newUrl.startsWith('data:')) {
                newUrl = `${config.apiUrl}${newUrl}`;
            }

            // Sync: If URL is http (permanent) but we are showing blob (temp), Switch!
            // Also update if URL completely changed.
            if (newUrl && newUrl !== selectedImage.src) {
                const isNewPermanent = newUrl.startsWith('http');

                if (isNewPermanent || (newUrl !== selectedImage.src)) {
                    setSelectedImage(prev => ({ ...prev, src: newUrl }));
                }
            }
        }
    }, [message.attachments, selectedImage, config.apiUrl]);

    // Auto-hide unread divider removed (handled in parent)

    const content = message.content || '';
    const type = message.type || 'text';
    const timestamp = message.timestamp;

    const isLongMessage = content.length > MESSAGE_MAX_LENGTH;
    const displayContent = isExpanded || !isLongMessage
        ? content
        : content.slice(0, MESSAGE_MAX_LENGTH) + '...';

    // In Agent Dashboard, 'outgoing' is when the sender is an agent or bot (handled by isAgent prop)
    const isSystem = type === 'system';

    const formattedTime = useMemo(() => formatTime(timestamp), [timestamp]);

    const spacerWidth = useMemo(() => {
        const timeWidth = formattedTime.length * 6; // Base char width approx 6px
        const statusWidth = (isAgent && message.status) ? 20 : 0;    // Add 20px (w-5) for status icon
        return timeWidth + statusWidth;
    }, [formattedTime, isAgent, message.status]);

    // Dynamic Styling based on Compact Mode
    // Default: h-8, text-sm. Compact: h-7, text-xs
    const avatarSize = compact ? 'h-7 w-7' : 'h-8 w-8';
    const textSize = compact ? 'text-xs' : 'text-sm';
    const bubblePadding = compact ? 'px-2 py-0.5 pb-1 pt-0.5 shadow-sm' : 'pt-0.5 px-2 pb-1.5 shadow-sm';

    // Bot Styling
    const isBot = senderType === 'bot';

    // Helper to render content with mentions and URLs
    const renderContent = (text) => {
        if (!text) return null;

        // 1. Split by mention regex first
        return text.split(/(@\w+(?:\s\w+)?)/g).map((part, i) => {
            // If it's a mention
            if (part.startsWith('@')) {
                const isMe = currentUser && part === `@${currentUser.name}`;
                return <span key={i} className={`font-bold ${isMe ? 'text-blue-400' : 'text-orange-300'}`}>{part}</span>;
            }

            // If it's normal text, check for URLs
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const subParts = part.split(urlRegex);

            return subParts.map((subPart, j) => {
                if (subPart.match(urlRegex)) {
                    return (
                        <a
                            key={`${i}-${j}`}
                            href={subPart}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`underline hover:opacity-80 transition-opacity ${roleStyles.link}`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {subPart}
                        </a>
                    );
                }
                return subPart;
            });
        });
    };

    // Helper: Single source of truth for Status Indicator with Tooltip
    const STATUS_LABELS = {
        pending: 'Pending',
        sent: 'Mengirim',
        delivered: 'Terkirim',
        read: 'Dibaca'
    };

    const renderStatusIndicator = (status, iconSize = 'w-4 h-4') => {
        if (!isAgent || !status) return null;
        return (
            <span className="ml-0.5" onClick={(e) => e.stopPropagation()}>
                <Tooltip delayDuration={500}>
                    <TooltipTrigger asChild>
                        <span className="cursor-help flex items-center">
                            {status === 'pending' && <Clock className={`${iconSize} animate-pulse ${roleStyles.indicator.pending}`} />}
                            {status === 'sent' && <Check className={`${iconSize} ${roleStyles.indicator.sent}`} />}
                            {status === 'delivered' && <CheckCheck className={`${iconSize} ${roleStyles.indicator.delivered}`} />}
                            {status === 'read' && <CheckCheck className={`${iconSize} ${roleStyles.indicator.read}`} />}
                        </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs bg-white text-slate-950 border-white font-medium shadow-md">
                        {STATUS_LABELS[status] || status}
                    </TooltipContent>
                </Tooltip>
            </span>
        );
    };

    // System Styling (Early Return)
    if (isSystem) {
        return (
            <div className={`flex justify-center my-2 animate-in fade-in duration-500 ${compact ? 'my-1' : 'my-2'}`}>
                <span className={`text-[10px] sm:text-xs font-medium text-slate-500/80 px-2 py-0.5 flex items-center gap-1.5 select-none`}>
                    {/* Optional: Add icon if needed via props or content parsing, for now just text style change */}
                    {renderContent(content)}
                </span>
            </div>
        );
    }

    // Detect single emoji
    // Uses Intl.Segmenter for accurate grapheme counting (handling ZWJ sequences like families)
    const isEmojiOnly = useMemo(() => {
        if (!content) return false;
        const trimmed = content.trim();
        if (!trimmed) return false;

        try {
            const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
            const segments = [...segmenter.segment(trimmed)];
            if (segments.length !== 1) return false;
        } catch (e) {
            // Fallback: if spread operator gives more than 15 code points, likely not a single emoji
            // Complex emojis like family sequences can have many code points
            if ([...trimmed].length > 15) return false;
        }

        // 2. Comprehensive emoji regex including:
        // - Extended Pictographic (core emojis)
        // - Emoji Presentation (emoji-style characters)
        // - Emoji Modifier (skin tone modifiers: Fitzpatrick scale)
        // - Regional Indicator (flag sequences like 🇮🇩)
        // - ZWJ (\u200D) for sequences like 👨‍👩‍👧
        // - Variation Selectors: VS15 (\uFE0E text) and VS16 (\uFE0F emoji)
        // - Combining Enclosing Keycap (\u20E3) for keycaps like 1️⃣
        const emojiRegex = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Regional_Indicator}\u200D\uFE0E\uFE0F\u20E3]+$/u;

        return emojiRegex.test(trimmed);
    }, [content]);

    const agentRole = message.agentRole || 'agent';

    // Generate role-based styles — always resolve, for both agent and visitor
    const roleStyles = isAgent
        ? getRoleStyles(agentRole, isBot)
        : getRoleStyles(null, false, true); // Visitor theme

    const bubbleBackground = roleStyles.bubble;
    const timestampBubbleBackground = roleStyles.bubble; // Reuse bubble bg for timestamp pill
    const timestampTextColor = roleStyles.indicator.timestamp;
    const senderColor = roleStyles.text;
    const linkStyles = roleStyles.link;
    const attachmentThemeClass = `${roleStyles.attachment.container} ${roleStyles.attachment.text}`;

    const bubbleRounding = isAgent
        ? `rounded-l-xl ${isFirstInGroup ? 'rounded-tr-xl' : 'rounded-tr-sm'} ${isLastInGroup ? 'rounded-br-xl' : 'rounded-br-sm'}`
        : `rounded-r-xl ${isFirstInGroup ? 'rounded-tl-xl' : 'rounded-tl-sm'} ${isLastInGroup ? 'rounded-bl-xl' : 'rounded-bl-sm'}`;


    // ============================================================
    // EMOJI-ONLY: Sticker-style layout (Emoji above, Timestamp bubble below)
    // ============================================================
    if (isEmojiOnly) {
        return (
            <div className={`flex gap-3 ${!isFirstInGroup ? 'mt-1' : 'mt-4'} ${isAgent ? 'justify-end' : 'justify-start'}`}>
                {/* Visitor Avatar */}
                {!isAgent && (
                    <div className={`${compact ? 'w-7' : 'w-8'} flex-shrink-0`}>
                        {isFirstInGroup && (
                            <Avatar className={avatarSize}>
                                <AvatarFallback className={`${getAvatarColor(senderName)} text-white text-xs font-medium`}>
                                    {getInitials(senderName)}
                                </AvatarFallback>
                            </Avatar>
                        )}
                    </div>
                )}

                {/* Content Container */}
                <div className={`flex flex-col ${isAgent ? 'items-end' : 'items-start'}`}>
                    {/* Sender Name */}
                    {isFirstInGroup && (
                        <span className={`text-xs font-medium px-1 mb-1 ${senderColor}`}>
                            {isAgent && currentUser && message.agentId === String(currentUser.id)
                                ? 'Anda'
                                : (senderName || (senderType === 'agent' ? 'Agent' : 'Visitor'))}
                        </span>
                    )}

                    {/* Large Emoji (No Bubble) */}
                    <span className="text-5xl leading-none my-4">{content}</span>

                    {/* Small Timestamp Bubble */}
                    <div className={`mt-1 px-2 py-0.5 rounded-full flex items-center gap-1 ${timestampBubbleBackground}`}>
                        <span className={`text-[9px] ${timestampTextColor}`}>{formattedTime}</span>
                        {/* Status Icon (Single Source of Truth) */}
                        {renderStatusIndicator(message.status)}
                    </div>
                </div>

                {/* Agent Avatar */}
                {isAgent && (
                    <div className={`${compact ? 'w-7' : 'w-8'} flex-shrink-0`}>
                        {isFirstInGroup && (
                            <Avatar className={avatarSize}>
                                <AvatarFallback className={`${isBot ? 'bg-emerald-900/50 text-emerald-400' : `${getAvatarColor(senderName)} text-white`} text-xs font-medium`}>
                                    {isBot ? <Bot className="w-5 h-5" /> : getInitials(senderName)}
                                </AvatarFallback>
                            </Avatar>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // ============================================================
    // STANDARD MESSAGE: Normal bubble layout
    // ============================================================
    const attachments = message.attachments || [];

    return (
        <>
            {/* Date Separator logic moved to ChatWindow */}
            {/* Unread Divider logic moved to ChatWindow */}

            <div className={`flex gap-3 ${!isFirstInGroup ? 'mt-1' : 'mt-4'} ${isAgent ? 'justify-end' : 'justify-start'}`}>
                {/* ... Avatars ... */}
                {!isAgent && (
                    <div className={`${compact ? 'w-7' : 'w-8'} flex-shrink-0`}>
                        {isFirstInGroup && (
                            <Avatar className={avatarSize}>
                                <AvatarFallback className={`${getAvatarColor(senderName)} text-white text-xs font-medium`}>
                                    {getInitials(senderName)}
                                </AvatarFallback>
                            </Avatar>
                        )}
                    </div>
                )}

                {/* Message Content */}
                <div className={`${maxWidth} flex flex-col ${isAgent ? 'items-end' : 'items-start'}`}>
                    {/* Sender Name - only show on first message of group */}
                    {isFirstInGroup && (
                        <span className={`text-xs font-medium px-1 mb-1 select-none ${senderColor}`}>
                            {/* Logic: If I am the sender, show 'You'. Else show Name (Agent B). */}
                            {isAgent && currentUser && message.agentId === String(currentUser.id)
                                ? 'Anda'
                                : (senderName || (senderType === 'agent' ? 'Agent' : 'Visitor'))}
                            {/* Optional Role Badge for other agents */}
                            {!isBot && isAgent && agentRole !== 'agent' && (
                                <Badge variant="outline" className={`ml-2 text-[10px] uppercase px-1.5 py-0 h-auto leading-relaxed font-medium ${roleStyles.badge}`}>
                                    {agentRole}
                                </Badge>
                            )}
                        </span>
                    )}

                    {/* Message Bubble */}
                    <div className={`${bubblePadding} leading-relaxed relative ${bubbleBackground} ${bubbleRounding} ${textSize}`} style={bubbleStyle}>

                        {/* Attachments - negative margin to align with bubble edge */}
                        {attachments.length > 0 && (
                            <div className="flex flex-col gap-2 -mx-1 mt-1 ">
                                {attachments.map((att, idx) => {
                                    // Robust URL handling
                                    let url = att.fileUrl || '';
                                    if (url && !url.startsWith('http') && !url.startsWith('blob:')) {
                                        url = `${config.apiUrl}${url}`;
                                    }

                                    // Get file extension from filename
                                    const fileName = att.fileOrigin || att.fileName || '';
                                    const ext = fileName.split('.').pop()?.toLowerCase() || '';

                                    // Robust type detection: check category OR MIME type OR extension
                                    const fileType = att.fileType?.toLowerCase() || '';

                                    const isImage = fileType === 'image' ||
                                        fileType.startsWith(MIME_PREFIX_IMAGE) ||
                                        IMAGE_EXTENSIONS.includes(ext);

                                    const isVideo = fileType === 'video' ||
                                        fileType.startsWith(MIME_PREFIX_VIDEO) ||
                                        VIDEO_EXTENSIONS.includes(ext);

                                    const isAudio = fileType === 'audio' ||
                                        fileType.startsWith(MIME_PREFIX_AUDIO) ||
                                        AUDIO_EXTENSIONS.includes(ext);

                                    const isPdf = fileType === MIME_TYPE_PDF || ext === 'pdf';

                                    const isDocument = fileType === 'document' ||
                                        DOCUMENT_EXTENSIONS.includes(ext);

                                    // URL with original filename for download
                                    const downloadUrl = url ? `${url}?name=${encodeURIComponent(fileName || 'file')}` : '#';

                                    return (
                                        <div key={idx} className="max-w-full">
                                            {isImage && url ? (
                                                <ImageAttachment
                                                    src={url}
                                                    fileName={fileName}
                                                    fileSize={att.fileSize}
                                                    previewUrl={att.previewUrl} // Only use previewUrl during uploads (local blob)
                                                    onClick={() => setSelectedImage({ src: url, alt: fileName, fileName })}
                                                    // Upload props for optimistic sending
                                                    uploadStatus={att.uploadStatus}
                                                    uploadProgress={att.uploadProgress}
                                                    onCancelUpload={att.onCancelUpload}
                                                    meta={att.meta} // Dimensions for instant layout
                                                    onResize={(w) => handleMediaResize(idx, w)}
                                                />
                                            ) : isVideo && url ? (
                                                <VideoThumbnail
                                                    src={url}
                                                    fileName={fileName}
                                                    fileSize={att.fileSize}
                                                    onPlay={(blobUrl, streamingSrc) => setSelectedVideo({
                                                        src: blobUrl,
                                                        streamingSrc: streamingSrc,
                                                        fileName
                                                    })}
                                                    // Upload props for optimistic sending
                                                    uploadStatus={att.uploadStatus}
                                                    uploadProgress={att.uploadProgress}
                                                    onCancelUpload={att.onCancelUpload}
                                                    thumbnailUrl={att.thumbnailUrl}
                                                    meta={att.meta} // Dimensions for instant layout
                                                    onResize={(w) => handleMediaResize(idx, w)}
                                                />
                                            ) : isAudio && url ? (
                                                <AudioPlayer
                                                    src={url}
                                                    fileName={fileName}
                                                    // Upload props for optimistic sending
                                                    uploadStatus={att.uploadStatus}
                                                    uploadProgress={att.uploadProgress}
                                                    onCancelUpload={att.onCancelUpload}
                                                    meta={att.meta} // Duration/Size fallbacks
                                                    fileSize={att.fileSize}
                                                    className={attachmentThemeClass}
                                                    playerStyles={roleStyles.attachment.player}
                                                    onResize={(w) => handleMediaResize(idx, w)}
                                                />
                                            ) : (isPdf || isDocument) && url ? (
                                                <DocumentAttachment
                                                    src={url}
                                                    fileName={fileName}
                                                    fileSize={att.fileSize}
                                                    // Upload props for optimistic sending
                                                    uploadStatus={att.uploadStatus}
                                                    uploadProgress={att.uploadProgress}
                                                    onCancelUpload={att.onCancelUpload}
                                                    className={attachmentThemeClass}
                                                    attachmentStyles={roleStyles.attachment}
                                                    onResize={(w) => handleMediaResize(idx, w)}
                                                />
                                            ) : url ? (
                                                <DocumentAttachment
                                                    src={url}
                                                    fileName={fileName}
                                                    fileSize={att.fileSize}
                                                    uploadStatus={att.uploadStatus}
                                                    uploadProgress={att.uploadProgress}
                                                    onCancelUpload={att.onCancelUpload}
                                                    className={attachmentThemeClass}
                                                    attachmentStyles={roleStyles.attachment}
                                                    onResize={(w) => handleMediaResize(idx, w)}
                                                />
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Special Case: Location Message */}
                        {message.type === 'location' && (
                            <div className="mb-1 -mx-0.5 mt-1">
                                <LocationAttachment
                                    src={content}
                                    address={message.meta?.address}
                                    attachmentStyles={roleStyles.attachment}
                                    onResize={(w) => handleMediaResize('loc', w)}
                                />
                            </div>
                        )}

                        {/* Content or Typing Indicator */}
                        {isTyping ? (
                            <div className="flex h-4 items-center gap-1.5 px-2 py-1">
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60" style={{ animationDelay: '0ms', animationDuration: '0.6s' }} />
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60" style={{ animationDelay: '150ms', animationDuration: '0.6s' }} />
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60" style={{ animationDelay: '300ms', animationDuration: '0.6s' }} />
                            </div>
                        ) : (
                            <>
                                {/* Content with inline spacer for timestamp */}
                                {content && message.type !== 'location' && (
                                    <span style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }} className="whitespace-pre-wrap block">
                                        {renderContent(displayContent)}
                                        {/* Inline Read More */}
                                        {isLongMessage && !isExpanded && (
                                            <button
                                                onClick={() => setIsExpanded(true)}
                                                className={`ml-1 text-xs font-medium hover:underline ${linkStyles}`}
                                            >
                                                Read more
                                            </button>
                                        )}
                                        {/* Invisible spacer for timestamp - only takes space on last line */}
                                        <span
                                            className="inline-block"
                                            style={{ width: `${spacerWidth}px` }}
                                        />
                                    </span>
                                )}
                                {/* Show Less Button Logic */}
                                {isLongMessage && isExpanded && content && (
                                    <button
                                        onClick={() => setIsExpanded(false)}
                                        className={`ml-1 text-xs font-medium hover:underline ${linkStyles}`}
                                    >
                                        Show less
                                    </button>
                                )}

                                {/* Timestamp & Status Indicator - positioned at bottom right */}
                                <span className={`absolute z-[40] bottom-0.5 right-2 flex items-center gap-0.5 text-[9px] select-none ${timestampTextColor}`} style={{ textShadow: attachments.length > 0 ? '0 1px 3px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.5)' : 'none' }}>
                                    {formattedTime}
                                    {/* Status Icon (Single Source of Truth) */}
                                    {renderStatusIndicator(message.status)}
                                </span>
                            </>
                        )}
                    </div>
                </div>
                {/* ... Agent Avatar ... */}
                {isAgent && (
                    <div className={`${compact ? 'w-7' : 'w-8'} flex-shrink-0`}>
                        {isFirstInGroup && (
                            <Avatar className={avatarSize}>
                                <AvatarFallback className={`${isBot ? 'bg-emerald-900/50 text-emerald-400' : `${getAvatarColor(senderName)} text-white`} text-xs font-medium`}>
                                    {isBot ? <Bot className="w-5 h-5" /> : getInitials(senderName)}
                                </AvatarFallback>
                            </Avatar>
                        )}
                    </div>
                )}
            </div>

            {/* Image Lightbox Viewer */}
            {selectedImage && (
                <ImageViewer
                    src={selectedImage.src}
                    alt={selectedImage.alt}
                    fileName={selectedImage.fileName}
                    onClose={() => setSelectedImage(null)}
                />
            )}

            {/* Video Lightbox Player */}
            {selectedVideo && (
                <VideoPlayer
                    src={selectedVideo.src}
                    streamingSrc={selectedVideo.streamingSrc}
                    fileName={selectedVideo.fileName}
                    onClose={() => setSelectedVideo(null)}
                />
            )}
        </>
    );
};

export default memo(MessageBubble);
