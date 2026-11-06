import { Bot, Check, CheckCheck, Clock, RotateCcw } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CircularProgress } from '@/components/ui/circular-progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getAvatarColor, getInitials } from '@/utils/avatar';
import { cn } from '@/utils/cn';
import { formatTime } from '@/utils/formatUtils';
import { getRoleStyles } from '@/utils/roleStyles';
import AudioPlayer from './attachments/AudioPlayer';
import DocumentAttachment from './attachments/DocumentAttachment';
import ImageAttachment from './attachments/ImageAttachment';
import ImageViewer from './attachments/ImageViewer';
import LocationAttachment from './attachments/LocationAttachment';
import VideoPlayer from './attachments/VideoPlayer';
import VideoThumbnail from './attachments/VideoThumbnail';

const MESSAGE_MAX_LENGTH = 300;
const STATUS_LABELS = {
  uploading: 'Mengunggah',
  compressing: 'Memproses',
  pending: 'Menunggu',
  sending: 'Mengirim',
  sent: 'Terkirim',
  delivered: 'Diterima',
  read: 'Dibaca',
  error: 'Gagal',
};

// Robust URL Regex
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

/**
 * MessageBubble Component (Ported from Agent System)
 *
 * Features:
 * - Visual Parity with Agent System (colors, rounding, layout)
 * - Emoji-Only Mode
 * - Internal Timestamp Bubble
 * - Attachments
 */
const StatusIndicator = memo(({ status, attachmentData, visualIsMe, roleStyles }) => {
  if (!visualIsMe || !status) return null;

  const uploadProgress = attachmentData?.[0]?.uploadProgress || 0;
  const onCancelUpload = attachmentData?.[0]?.onCancelUpload;
  const onRetryUpload = attachmentData?.[0]?.onRetryUpload;

  if (status === 'uploading' || status === 'compressing') {
    return (
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onCancelUpload?.();
            }}
            className="ml-1 flex h-4 w-4 cursor-pointer items-center border-0 bg-transparent p-0 hover:bg-transparent"
          >
            <CircularProgress percentage={uploadProgress} size={14} strokeWidth={2} color="#fff" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {uploadProgress}% - Klik untuk batalkan
        </TooltipContent>
      </Tooltip>
    );
  }

  if (status === 'error') {
    return (
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onRetryUpload?.();
            }}
            className="ml-1 flex h-4 w-4 cursor-pointer items-center border-0 bg-transparent p-0 text-red-500 hover:bg-transparent hover:text-red-400"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Gagal - Klik untuk coba lagi
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <span className="ml-1 flex cursor-help items-center">
          {status === 'sending' && (
            <Clock className={cn('h-3 w-3 animate-pulse', roleStyles.indicator.sending)} />
          )}
          {status === 'pending' && (
            <Clock className={cn('h-3 w-3', roleStyles.indicator.pending)} />
          )}
          {status === 'sent' && <Check className={cn('h-3 w-3', roleStyles.indicator.sent)} />}
          {status === 'delivered' && (
            <CheckCheck className={cn('h-3 w-3', roleStyles.indicator.delivered)} />
          )}
          {status === 'read' && <CheckCheck className={cn('h-3 w-3', roleStyles.indicator.read)} />}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {STATUS_LABELS[status] || status}
      </TooltipContent>
    </Tooltip>
  );
});

const MessageBubble = memo(
  ({
    message,
    isFirstInGroup,
    isLastInGroup,
    showAvatar,
    senderName,
    agentId, // New prop
    isTyping = false, // New prop
    isBot: isBotProp = false, // Renamed to avoid conflict
    backendUrl,
    clientId,
  }) => {
    const [viewerMedia, setViewerMedia] = useState(null);
    // Removed unused state: selectedImage, isExpanded

    // MAPPING: Widget "isIncoming" (Left) vs Agent "isAgent=False" (Left)
    // Widget: isIncoming=true -> Left (Them/Agent default in widget context? Wait.)
    // Context: Widget is for VALID Visitors.
    // Visitor messages are OUTGOING (Right). Agent messages are INCOMING (Left).
    // Agent System: isAgent=true (Right - Me), Visitor (Left - Them).

    // Let's stick to the visual REQUEST:
    // Widget "Incoming" (Agent replying) -> Should look like Agent System "Visitor" (Left)? NO.
    // The visual request is to make the BUBBLE look "PERSIS" (Exact).
    // Agent Default (Purple/Green) is for AGENTS (Right in Dashboard).
    // Visitor Default (Gray) is for VISITORS (Left in Dashboard).

    // Widget Context:
    // User is Visitor -> Messages are "Me" (Right). Should look like Visitor in Dashboard?
    // OR should "Me" always be Colored?
    // Usually: "Me" (Right) is Primary Color. "Them" (Left) is Gray.

    // Agent Dashboard:
    // Me (Agent) = Right = Purple/Green.
    // Them (Visitor) = Left = Gray.

    // Widget:
    // Me (Visitor) = Right. should match Agent Dashboard "Right"?
    // IF the user wants "Exact Match", they might mean the *Design System*.
    // Agent System Right: Purple (Agent) / Green (Bot).
    // Agent System Left: Gray (Visitor).

    // Widget Right (Visitor): Should be Purple/Blue?
    // Standard Widget: Me = Primary.
    // Let's use the Agent System's "Agent" styling for the Widget's "Me" (Right) to keep "Right side = Colorful".
    // And "Them" (Agent/Bot) = Gray? No that feels wrong. Agent should be distinctive.

    // LET'S LOOK AT THE ORIGINAL WIDGET CODE:
    // Incoming (Left) = Gray/White.
    // Outgoing (Right) = Blue.

    // Re-evaluating User Request: "Tampilan message bubble... belum sama persis".
    // They probably want the *structure* (Timestamp inside, emoji mode, rounded corners logic) to match.
    // I will map:
    // Widget Outgoing (Me/Visitor) -> Agent Dashboard "Agent" Style (Right side, styled).
    // Widget Incoming (Agent/Bot) -> Agent Dashboard "Visitor" Style (Left side, gray) ??
    // WAIT. If Agent talks, it should probably look like the Agent?
    // But commonly in chat apps:
    // Right (Me) = Color.
    // Left (Them) = Gray/White.

    // So I will apply:
    // Widget Outgoing (Right) -> Uses AgentDashboard 'isAgent=true' styles (Purple/Green).
    // Widget Incoming (Left) -> Uses AgentDashboard 'isAgent=false' styles (Gray).

    // Widget Outgoing (Right) -> sender === 'visitor'
    // Widget Incoming (Left) -> sender !== 'visitor'

    // Determine if Bot (for styling)
    const isBot = isBotProp || message.sender === 'bot';

    // Check type='system' OR sender='system'
    const isSystem = message.sender === 'system' || message.type === 'system';

    // Visual Logic: Me (Visitor) = Right. Them (Agent) = Left.
    const visualIsMe = message.sender === 'visitor';
    // Media Handlers
    // ImageAttachment passes viewerData: { blob, fullUrl, fileName }
    const handleImageClick = useCallback((viewerData) => {
      setViewerMedia({
        type: 'image',
        blob: viewerData?.blob || null,
        fullUrl: viewerData?.fullUrl || null,
        fileName: viewerData?.fileName || 'Image',
        alt: 'Image',
      });
    }, []);

    const handleVideoPlay = useCallback((blob, src, fileName) => {
      setViewerMedia({ type: 'video', src: blob ? URL.createObjectURL(blob) : src, fileName });
    }, []);

    const closeViewer = useCallback(() => {
      setViewerMedia(null);
    }, []);

    const [isExpanded, setIsExpanded] = useState(false);

    // Content Processing
    const content = message.content || '';
    const isLongMessage = content.length > MESSAGE_MAX_LENGTH;
    const displayContent =
      isExpanded || !isLongMessage ? content : `${content.slice(0, MESSAGE_MAX_LENGTH)}...`;

    // Emoji Detection
    const isEmojiOnly = useMemo(() => {
      if (!content) return false;
      const trimmed = content.trim();
      if (!trimmed) return false;

      try {
        // 1. Check if it's a short sequence of grapheme clusters (up to 3 emojis for jumbo size)
        // This handles complex emojis like family (👨👩👧) correctly as 1 unit
        const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
        const segments = [...segmenter.segment(trimmed)];
        if (segments.length !== 1) return false;
      } catch {
        // Fallback: if spread operator gives more than 15 code points, likely not a small emoji message
        // Complex emojis like family sequences can have many code points
        if ([...trimmed].length > 15) return false;
      }

      // 2. Comprehensive emoji regex including:
      // - Extended Pictographic (core emojis)
      // - Emoji Presentation (emoji-style characters)
      // - Emoji Modifier (skin tone modifiers: Fitzpatrick scale)
      // - Regional Indicator (flag sequences like 🇮🇩)
      // - ZWJ (\u200D) for sequences like 👨👩👧
      // - Variation Selectors: VS15 (\uFE0E text) and VS16 (\uFE0F emoji)
      // - Combining Enclosing Keycap (\u20E3) for keycaps like 1️⃣
      // EXCLUDES \p{Emoji_Component} which matches raw numbers

      /* eslint-disable no-misleading-character-class */
      const emojiRegex =
        // biome-ignore lint/suspicious/noMisleadingCharacterClass: Regex for complex unicode is intentional
        /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Regional_Indicator}\u200D\uFE0E\uFE0F\u20E3]+$/u;
      /* eslint-enable no-misleading-character-class */

      return emojiRegex.test(trimmed);
    }, [content]);

    // Metadata
    const formattedTime = useMemo(
      () => (message.timestamp ? formatTime(message.timestamp) : ''),
      [message.timestamp],
    );

    // Dynamic Spacer Width (Memoized)
    const spacerWidth = useMemo(() => {
      const timeWidth = formattedTime.length * 6; // Base char width approx 6px
      const statusWidth = visualIsMe ? 20 : 0; // Add 20px (w-5) for status icon
      return timeWidth + statusWidth;
    }, [formattedTime, visualIsMe]);

    // Styles
    // Styles
    const roleStyles = getRoleStyles(message.agentRole, isBot, visualIsMe);

    const bubbleBackground = roleStyles.bubble;
    const bubbleText = roleStyles.text;

    // Attachment Theme Logic
    // We pass the entire attachment theme object down, or a specific class string if needed
    // For backward compatibility with components expecting 'className', we construct it here
    // BUT optimal way is to pass the full object if components support it.
    // For now, let's construct the string as we did before, but using the new theme values.
    const attachmentThemeClass = `${roleStyles.attachment.container} ${roleStyles.attachment.text}`;

    // Media-Only Detection: Messages with only media (no text body visible)
    const isMediaOnly = !content && message.attachments?.length > 0;

    // Check if we need white text (Video/Image have dark overlays)
    // Only applies if it's media-only AND the last attachment is an image or video
    const lastAttachment = message.attachments?.[message.attachments.length - 1];
    const lastType = lastAttachment?.type || lastAttachment?.fileType;
    const isOverlayMedia = isMediaOnly && (lastType === 'image' || lastType === 'video');

    // Dynamic Width State
    const [mediaWidths, setMediaWidths] = useState({});

    // Callback from child attachments (Image/Video) to report their rendered width
    const handleMediaResize = useCallback((index, width) => {
      setMediaWidths((prev) => {
        if (prev[index] === width) return prev;
        return { ...prev, [index]: width };
      });
    }, []);

    // Calculate max width from all reported media
    const bubbleStyle = useMemo(() => {
      // ALLOW ALL attachments to report width, not just if hasAttachments is true (Location is strict type)
      const widths = Object.values(mediaWidths);
      if (widths.length > 0) {
        const maxMediaWidth = Math.max(...widths);
        if (maxMediaWidth > 0) {
          return { width: `${maxMediaWidth}px`, maxWidth: '100%' };
        }
      }
      return {};
    }, [mediaWidths]);

    // System Message Styling (Early Return)
    if (isSystem) {
      return (
        <div className="fade-in my-2 flex w-full animate-in justify-center duration-500">
          {' '}
          {/* Root: w-full added */}
          <span className="flex select-none items-center gap-1.5 px-2 py-0.5 font-medium text-[10px] text-slate-500/80 sm:text-xs">
            {message.content}
          </span>
        </div>
      );
    }

    // --- RENDER: STANDARD ---
    return (
      <>
        <div
          className={cn(
            'flex w-full gap-2',
            isFirstInGroup ? 'mt-4' : 'mt-1',
            visualIsMe ? 'justify-end' : 'justify-start',
          )}
        >
          {/* Avatar (Left) */}
          {!visualIsMe && (
            <div className="w-8 flex-shrink-0">
              <div className="w-8">
                {showAvatar && (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback
                      className={cn(
                        isBot
                          ? 'bg-blue-600'
                          : getAvatarColor(agentId ? `${agentId}-${senderName}` : senderName),
                        'font-medium text-white text-xs',
                      )}
                    >
                      {isBot ? <Bot className="h-5 w-5" /> : getInitials(senderName)}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            </div>
          )}

          {/* Bubble Container */}
          <div
            className={cn('flex max-w-[80%] flex-col', visualIsMe ? 'items-end' : 'items-start')}
          >
            {/* Sender Name (Only Incoming First) */}
            {isFirstInGroup && !visualIsMe && (
              <div className="mb-1 ml-1 flex select-none items-center gap-1.5">
                <span className="whitespace-nowrap font-medium text-[10px] text-gray-500">
                  {senderName}
                </span>
                {/* Role Badge */}
                {(message.agentRole || isBot) && (
                  <Badge
                    variant="outline"
                    className={cn(
                      // Override Badge defaults to match original styles exactly:
                      // - rounded-full -> rounded
                      // - px-2.5 -> px-1.5
                      // - text-xs -> text-[8px]
                      // - font-semibold (kept)
                      // - border (kept)
                      'h-auto min-h-0 min-w-0 whitespace-nowrap rounded px-1.5 py-0.5 font-semibold text-[8px] uppercase leading-none shadow-none hover:bg-transparent',
                      // Apply dynamic colors
                      roleStyles?.badge || 'border-gray-200 bg-gray-100 text-gray-600',
                    )}
                  >
                    {isBot ? 'Bot' : message.agentRole}
                  </Badge>
                )}
              </div>
            )}

            {/* THE BUBBLE or EMOJI VIEW */}
            {isEmojiOnly ? (
              <div className={cn('flex flex-col', visualIsMe ? 'items-end' : 'items-start')}>
                {/* Large Emoji */}
                <span className="my-2 text-5xl leading-none">{content}</span>
                {/* Timestamp for Emoji Only (Separate Pill) */}
                <div
                  className={cn(
                    'mt-1 flex items-center gap-1 rounded-full border border-white/20 px-2 py-0.5 shadow-[0_2px_4px_-1px_rgba(0,0,0,0.1),0_4px_6px_-1px_rgba(0,0,0,0.06),inset_0_1px_1px_rgba(255,255,255,0.3)]',
                    bubbleBackground,
                    roleStyles.indicator.timestamp,
                  )}
                >
                  <span className="select-none text-[10px] tabular-nums">{formattedTime}</span>
                  <StatusIndicator
                    status={message.status}
                    attachmentData={message.attachments}
                    visualIsMe={visualIsMe}
                    roleStyles={roleStyles}
                  />
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  'relative overflow-hidden break-words p-1 text-sm shadow-[0_2px_4px_-1px_rgba(0,0,0,0.1),0_4px_6px_-1px_rgba(0,0,0,0.06),inset_0_1px_1px_rgba(255,255,255,0.3)]',
                  bubbleBackground,
                  bubbleText,
                  // Rounding Logic
                  visualIsMe
                    ? cn(
                        'rounded-l-xl',
                        isFirstInGroup ? 'rounded-tr-xl' : 'rounded-tr-sm',
                        isLastInGroup ? 'rounded-br-xl' : 'rounded-br-sm',
                      )
                    : cn(
                        'rounded-r-xl',
                        isFirstInGroup ? 'rounded-tl-xl' : 'rounded-tl-sm',
                        isLastInGroup ? 'rounded-bl-xl' : 'rounded-bl-sm',
                      ),
                )}
                style={bubbleStyle}
              >
                {/* Attachments */}
                {message.attachments && message.attachments.length > 0 && (
                  <div className={cn('-mx-0.5 flex flex-col')}>
                    {message.attachments.map((att, i) => {
                      const type = att.type || att.fileType;
                      const url = att.url || att.fileUrl;
                      const name = att.fileOrigin || att.fileName || att.name;

                      return (
                        <div key={att.id || `att-${i}`} className="max-w-full">
                          {type === 'image' && (
                            <ImageAttachment
                              src={url}
                              fileName={name}
                              meta={att.meta}
                              onClick={handleImageClick}
                              backendUrl={backendUrl}
                              clientId={clientId}
                              thumbnailBlob={att.thumbnailBlob}
                              thumbnailUrl={att.thumbnailUrl}
                              onResize={(w) => handleMediaResize(i, w)}
                              isMediaOnly={isMediaOnly}
                            />
                          )}
                          {type === 'video' && (
                            <VideoThumbnail
                              src={url}
                              fileName={name}
                              onPlay={(blob, src) => handleVideoPlay(blob, src, name)}
                              thumbnailBlob={att.thumbnailBlob}
                              thumbnailUrl={att.thumbnailUrl}
                              backendUrl={backendUrl}
                              clientId={clientId}
                              meta={{ ...att.meta, size: att.fileSize || att.size }}
                              onResize={(w) => handleMediaResize(i, w)}
                              isMediaOnly={isMediaOnly}
                            />
                          )}
                          {type === 'audio' && (
                            <AudioPlayer
                              src={url}
                              fileName={name}
                              fileSize={att.fileSize}
                              duration={att.meta?.duration}
                              backendUrl={backendUrl}
                              clientId={clientId}
                              className={attachmentThemeClass}
                              playerStyles={roleStyles.attachment.player}
                              onResize={(w) => handleMediaResize(i, w)}
                            />
                          )}
                          {(type === 'file' || type === 'document') && (
                            <DocumentAttachment
                              src={url}
                              fileName={name}
                              fileSize={att.fileSize}
                              backendUrl={backendUrl}
                              clientId={clientId}
                              className={attachmentThemeClass}
                              attachmentStyles={roleStyles.attachment}
                              onResize={(w) => handleMediaResize(i, w)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Special Case: Location Message */}
                {message.type === 'location' && (
                  <div className="-mx-0.5">
                    <LocationAttachment
                      src={content}
                      address={message.meta?.address}
                      className={attachmentThemeClass}
                      onResize={(w) => handleMediaResize('loc', w)}
                    />
                  </div>
                )}

                {/* Content or Typing Indicator */}
                {isTyping ? (
                  <div className="flex h-4 items-center gap-1.5 px-2 py-1">
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60"
                      style={{ animationDelay: '0ms', animationDuration: '0.6s' }}
                    />
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60"
                      style={{ animationDelay: '150ms', animationDuration: '0.6s' }}
                    />
                    <span
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-current opacity-60"
                      style={{ animationDelay: '300ms', animationDuration: '0.6s' }}
                    />
                  </div>
                ) : (
                  <>
                    {content && message.type !== 'location' && (
                      <span
                        style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                        className="block whitespace-pre-wrap px-2 pb-1"
                      >
                        {(() => {
                          const parts = displayContent.split(URL_REGEX);

                          return parts.map((part, i) => {
                            if (part.match(URL_REGEX)) {
                              return (
                                <a
                                  // Using part substring + index as key since these are purely static text segments
                                  // This satisfies the linter while keeping the key relatively stable based on content
                                  key={`link-${part.substring(0, 15)}-${i}`}
                                  href={part}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={cn('hover:underline', roleStyles.link)}
                                  onClick={(e) => e.stopPropagation()} // Prevent bubble click if any
                                >
                                  {part}
                                </a>
                              );
                            }
                            return part;
                          });
                        })()}
                        {/* Inline Read More */}
                        {isLongMessage && !isExpanded && (
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => setIsExpanded(true)}
                            className={cn(
                              'ml-1 h-auto p-0 font-medium text-xs hover:underline',
                              (() => {
                                if (!visualIsMe) return 'text-blue-400';
                                if (isBot) return 'text-emerald-200';
                                return 'text-blue-200'; // Adjusted for Widget blue theme
                              })(),
                            )}
                          >
                            Read more
                          </Button>
                        )}
                        {/* Invisible spacer for timestamp - only takes space on last line */}
                        <span className="inline-block" style={{ width: `${spacerWidth}px` }} />
                      </span>
                    )}
                    {/* Show Less Button Logic */}
                    {isLongMessage && isExpanded && content && (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => setIsExpanded(false)}
                        className={cn(
                          'ml-1 block h-auto p-0 font-medium text-xs hover:underline',
                          (() => {
                            if (!visualIsMe) return 'opacity-70'; // Use opacity for "show less" on agent side to blend with text color
                            if (isBot) return 'text-emerald-200';
                            return 'text-blue-200';
                          })(),
                        )}
                      >
                        Show less
                      </Button>
                    )}

                    {/* Metadata (Inside Bubble, Floating Bottom Right) */}
                    {/* Timestamp & Status Indicator - Absolute Positioned */}
                    <span
                      className={cn(
                        'absolute right-2.5 bottom-0.5 z-[40] flex select-none items-center gap-0.5 text-[10px]',
                        isOverlayMedia
                          ? 'text-white/90 drop-shadow-md'
                          : roleStyles.indicator.timestamp,
                      )}
                    >
                      {formattedTime}
                      <StatusIndicator
                        status={message.status}
                        attachmentData={message.attachments}
                        visualIsMe={visualIsMe}
                        roleStyles={roleStyles}
                      />
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Me Avatar (Right? Usually not shown in Widget for self, but if exact match...)
                    Agent system SHOWS Agent Avatar on Right.
                    Widget usually doesn't show Visitor Avatar.
                    I'll hide it for "Me" to keep UI clean unless requested.
                 */}
        </div>

        {/* Media Portals */}
        {viewerMedia?.type === 'image' && (
          <ImageViewer
            blob={viewerMedia.blob}
            fullUrl={viewerMedia.fullUrl}
            src={viewerMedia.fullUrl}
            alt={viewerMedia.alt}
            fileName={viewerMedia.fileName}
            onClose={closeViewer}
          />
        )}

        {viewerMedia?.type === 'video' && (
          <VideoPlayer
            src={viewerMedia.src}
            fileName={viewerMedia.fileName}
            onClose={closeViewer}
            backendUrl={backendUrl}
            clientId={clientId}
          />
        )}
      </>
    );
  },
);

export default MessageBubble;
