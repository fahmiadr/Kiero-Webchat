import { Debouncer } from '@tanstack/pacer'; // Import Debouncer
import { AnimatePresence, m } from 'framer-motion';
import {
  FileText,
  Headphones,
  Image as ImageIcon,
  MapPin,
  Paperclip,
  Send,
  Smile,
} from 'lucide-react';
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ACCEPT_AUDIO,
  ACCEPT_IMAGE,
  ACCEPT_VIDEO,
  DOCUMENT_EXTENSIONS,
} from '@/constants/fileTypes';
import CustomEmojiPicker from './CustomEmojiPicker';

const MAX_MESSAGE_LENGTH = 500;

const getGraphemeCount = (text) => {
  return [...(text || '')].length;
};

// Animation Variants - Water Droplet / Ripple Effect
const drawerVariants = {
  hidden: (custom) => ({
    clipPath:
      custom === 'emoji'
        ? 'circle(0% at 0% 100%)' // Start from bottom-left
        : 'circle(0% at 100% 100%)', // Start from bottom-right (unused here but kept for completeness)
    opacity: 0, // Slight opacity fade for softness
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 40,
    },
  }),
  visible: (custom) => ({
    clipPath:
      custom === 'emoji'
        ? 'circle(150% at 0% 100%)' // Expand to cover specific origin
        : 'circle(150% at 100% 100%)', // Expand to cover specific origin
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 250, // Slightly softer for the "wave" feel
      damping: 25,
      mass: 0.5,
      staggerChildren: 0.03, // Fast stagger for "burst" effect
      delayChildren: 0.1,
      staggerDirection: custom === 'emoji' ? 1 : -1, // Reverse for attachments (bottom-right origin)
    },
  }),
  exit: (custom) => ({
    clipPath: custom === 'emoji' ? 'circle(0% at 0% 100%)' : 'circle(0% at 100% 100%)',
    opacity: 0,
    transition: {
      type: 'spring',
      stiffness: 250, // Reduced from 300 for slower movement
      damping: 25, // Adjusted for smooth settle
      mass: 1, // Increased slightly to add 'weight' to the water
      staggerChildren: 0.05, // Slower ripple (was 0.02)
      staggerDirection: custom === 'emoji' ? -1 : 1,
      opacity: { duration: 0.3 }, // Slower fade (was 0.2)
    },
  }),
};

const itemVariants = {
  hidden: {
    scale: 0.1,
    opacity: 0,
    y: 10,
  },
  visible: {
    scale: 1,
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 260, // Reduced from 400 to minimize overshoot scale
      damping: 20, // Increased from 15 to reduce bounciness
    },
  },
  exit: {
    scale: 0.1,
    opacity: 0,
    transition: { duration: 0.1 },
  },
};

// Variants for switching content (Crossfade/Slide)
const switchVariants = {
  hidden: (direction) => ({
    opacity: 0,
    x: direction > 0 ? 20 : -20, // Slide from right or left
  }),
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.2,
      staggerChildren: 0.05, // Stagger children for attachments
    },
  },
  exit: (direction) => ({
    opacity: 0,
    x: direction < 0 ? 20 : -20, // Slide out to right or left
    transition: { duration: 0.2 },
  }),
};

/**
 * MessageInput - Optimized text input component
 * Handles local state, auto-resize, and character counting to prevent parent re-renders.
 */
const MessageInput = memo(
  forwardRef(({ onTyping, onEmptyChange, onKeyDown, placeholder }, ref) => {
    const [message, setMessage] = useState('');
    const textareaRef = useRef(null);
    const typingDebouncer = useRef(null);
    const [needsScroll, setNeedsScroll] = useState(false);

    // Maximum height for the textarea in pixels
    const MAX_HEIGHT_PX = 80;

    // Initialize Debouncers
    useEffect(() => {
      typingDebouncer.current = new Debouncer(
        (isTyping) => {
          onTyping?.(isTyping);
        },
        { wait: 300 },
      );

      return () => {
        typingDebouncer.current?.cancel();
      };
    }, [onTyping]);

    // Auto-resize textarea based on content
    useEffect(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = 'auto'; // Reset height
        const scrollHeight = textarea.scrollHeight;

        // Constrain height
        const newHeight = Math.min(Math.max(scrollHeight, 40), MAX_HEIGHT_PX);
        textarea.style.height = `${newHeight}px`;

        // Allow scroll if content exceeds max height
        setNeedsScroll(scrollHeight > MAX_HEIGHT_PX);
      }
    }, [message]);

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
      clear: () => {
        setMessage('');
        onEmptyChange?.(true);
        typingDebouncer.current?.cancel(); // Fix: prevent delayed typing signals after send
      },
      focus: () => {
        textareaRef.current?.focus();
      },
      setMessage: (msg) => {
        setMessage(msg);
        onEmptyChange?.(!msg);
      },
      getMessage: () => message,
      appendMessage: (val) => {
        const newValue = message + val;
        if (getGraphemeCount(newValue) <= MAX_MESSAGE_LENGTH) {
          setMessage(newValue);
          onEmptyChange?.(!newValue);
        }
      },
    }));

    const handleChange = (e) => {
      const newValue = e.target.value;
      if (getGraphemeCount(newValue) <= MAX_MESSAGE_LENGTH) {
        setMessage(newValue);
        onEmptyChange?.(newValue.length === 0);

        // Debounce typing indicator
        if (newValue.length > 0) {
          typingDebouncer.current?.maybeExecute(true);
        }
      }
    };

    const charCount = getGraphemeCount(message);

    return (
      <>
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={1}
          className={`max-h-[72px] min-h-[24px] flex-1 resize-none whitespace-pre-wrap break-words border-none bg-transparent py-2 text-gray-800 text-sm leading-[22px] shadow-none placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar]:w-1.5 ${needsScroll ? 'overflow-y-auto' : 'overflow-hidden'}`}
        />

        {/* Character Counter (Absolute positioned) */}
        {charCount > 0 &&
          (() => {
            let charCountColor = 'text-gray-400';
            if (charCount >= MAX_MESSAGE_LENGTH) {
              charCountColor = 'text-red-500';
            } else if (charCount >= MAX_MESSAGE_LENGTH * 0.9) {
              charCountColor = 'text-amber-500';
            }
            return (
              <span
                className={`pointer-events-none absolute right-14 bottom-0 font-medium text-[10px] tabular-nums transition-colors duration-200 ${charCountColor}`}
              >
                {charCount}/{MAX_MESSAGE_LENGTH}
              </span>
            );
          })()}
      </>
    );
  }),
);

/**
 * InputArea - Message input component (WhatsApp style)
 * Features:
 * - Unified Drawer for Emojis and Attachments
 * - Attachment Grid: Gallery, Camera, Location, Document, Audio
 * - Emoji Picker (Emoji Mart)
 */
const InputArea = forwardRef(
  ({ onSend, onTyping, onAttachment, onHeightChange, isMobile, onLocationPickerOpen }, ref) => {
    // Local state for UI toggles only
    const [activeDrawer, setActiveDrawer] = useState(null); // 'emoji' | 'attachments' | null
    const [isEmpty, setIsEmpty] = useState(true); // Track content presence for Send button

    // File input configuration
    const [fileAccept, setFileAccept] = useState('*');
    const [fileCapture, setFileCapture] = useState(null);

    // Refs
    const messageInputRef = useRef(null); // Ref to MessageInput
    const containerRef = useRef(null);
    const drawerRef = useRef(null);
    const emojiButtonRef = useRef(null);
    const attachmentButtonRef = useRef(null);
    const fileInputRef = useRef(null);

    // Expose methods to parent via forwarded ref
    useImperativeHandle(ref, () => ({
      clear: () => {
        messageInputRef.current?.clear();
        setIsEmpty(true);
        setActiveDrawer(null);
      },
      focus: () => {
        messageInputRef.current?.focus();
      },
      setMessage: (msg) => {
        messageInputRef.current?.setMessage(msg);
        setIsEmpty(!msg);
      },
      getMessage: () => messageInputRef.current?.getMessage() || '',
    }));

    // Height Change Debouncer
    const heightChangeDebouncer = useRef(null);

    // Initialize Debouncers
    useEffect(() => {
      heightChangeDebouncer.current = new Debouncer(
        (height) => {
          onHeightChange?.(height);
        },
        { wait: 100 },
      );

      return () => {
        heightChangeDebouncer.current?.cancel();
      };
    }, [onHeightChange]);

    // Sync scroll height when value or drawing state changes
    useEffect(() => {
      if (containerRef.current && onHeightChange) {
        const observer = new ResizeObserver((entries) => {
          for (const entry of entries) {
            // Use debouncer to prevent excessive updates
            heightChangeDebouncer.current?.maybeExecute(entry.contentRect.height);
          }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
      }
    }, [onHeightChange]);

    // Handle click outside to close drawer
    const handleClickOutside = useCallback((e) => {
      if (emojiButtonRef.current?.contains(e.target)) return;
      if (attachmentButtonRef.current?.contains(e.target)) return;
      if (drawerRef.current?.contains(e.target)) return;
      setActiveDrawer(null);
    }, []);

    useEffect(() => {
      if (activeDrawer) {
        const timer = setTimeout(() => {
          document.addEventListener('click', handleClickOutside);
        }, 100);

        return () => {
          clearTimeout(timer);
          document.removeEventListener('click', handleClickOutside);
        };
      }
    }, [activeDrawer, handleClickOutside]);

    const handleSubmit = (e) => {
      e.preventDefault();
      const msg = messageInputRef.current?.getMessage()?.trim();
      if (!msg) return;

      onSend(msg);
      messageInputRef.current?.clear();
      setIsEmpty(true);
      setActiveDrawer(null);
      messageInputRef.current?.focus();
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    };

    const toggleDrawer = (drawerName) => {
      setActiveDrawer((prev) => (prev === drawerName ? null : drawerName));
    };

    const handleFileAction = useCallback((accept, capture = null) => {
      setFileAccept(accept);
      setFileCapture(capture);
      // Timeout to allow state update before click
      setTimeout(() => {
        fileInputRef.current?.click();
        setActiveDrawer(null); // Close drawer after selection
      }, 0);
    }, []);

    const handleFileChange = (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0 && onAttachment) {
        // Pass current message as caption
        const currentMsg = messageInputRef.current?.getMessage() || '';
        onAttachment(files, currentMsg);
      }
      e.target.value = ''; // Reset input
    };

    const handleEmojiSelect = (emoji) => {
      messageInputRef.current?.appendMessage(emoji.native);
      setIsEmpty(false);
      // Only refocus on desktop to avoid keyboard popping up on mobile
      if (!isMobile) {
        messageInputRef.current?.focus();
      }
    };

    const handleLocationShare = useCallback(() => {
      if (onLocationPickerOpen) {
        onLocationPickerOpen();
        setActiveDrawer(null);
      }
    }, [onLocationPickerOpen]);

    const attachmentOptions = useMemo(
      () => [
        {
          label: 'Dokumen',
          icon: FileText,
          color: 'bg-indigo-500',
          action: () => handleFileAction(DOCUMENT_EXTENSIONS.map((ext) => `.${ext}`).join(',')),
        },
        {
          label: 'Foto/Video',
          icon: ImageIcon,
          color: 'bg-purple-500',
          action: () => handleFileAction(`${ACCEPT_IMAGE},${ACCEPT_VIDEO}`),
        },
        {
          label: 'Audio',
          icon: Headphones,
          color: 'bg-orange-500',
          action: () => handleFileAction(ACCEPT_AUDIO),
        },
        {
          label: 'Lokasi',
          icon: MapPin,
          color: 'bg-green-500',
          action: handleLocationShare,
        },
      ],
      [handleFileAction, handleLocationShare],
    );

    return (
      <div
        ref={containerRef}
        className={`relative border-gray-100 border-t bg-white ${isMobile ? 'pb-[max(12px,env(safe-area-inset-bottom))]' : 'rounded-b-xl'} z-[45]`}
      >
        {/* Unified Drawer (Emoji & Attachments) - Overlay */}
        <AnimatePresence mode="wait" custom={activeDrawer}>
          {activeDrawer && (
            <m.div
              key="drawer"
              ref={drawerRef}
              custom={activeDrawer}
              variants={drawerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 bottom-full left-0 z-50 overflow-hidden rounded-t-2xl border-gray-100 border-b bg-white"
              style={{
                height: '260px', // Slightly taller for better spacing
                marginBottom: '0px', // Connects directly to input area
              }}
            >
              <AnimatePresence mode="wait" custom={activeDrawer === 'attachments' ? 1 : -1}>
                {activeDrawer === 'emoji' && (
                  <m.div
                    key="emoji"
                    custom={-1}
                    variants={switchVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="absolute inset-0 h-full w-full bg-white"
                  >
                    <CustomEmojiPicker onSelect={handleEmojiSelect} />
                  </m.div>
                )}

                {activeDrawer === 'attachments' && (
                  <m.div
                    key="attachments"
                    custom={1}
                    variants={switchVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="absolute inset-0 grid h-full w-full grid-cols-3 content-center justify-items-center gap-6 overflow-y-auto bg-white p-6"
                  >
                    {attachmentOptions.map((option) => (
                      <m.button
                        key={option.label}
                        onClick={option.action}
                        variants={itemVariants}
                        className="group flex w-full transform-gpu select-none flex-col items-center gap-2 will-change-transform"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <div
                          className={`flex h-14 w-14 items-center justify-center rounded-full text-white shadow-gray-200 shadow-lg transition-transform duration-200 ${option.color}`}
                        >
                          <option.icon className="h-6 w-6" />
                        </div>
                        <span className="font-medium text-gray-600 text-xs">{option.label}</span>
                      </m.button>
                    ))}
                  </m.div>
                )}
              </AnimatePresence>
            </m.div>
          )}
        </AnimatePresence>

        {/* Hidden dynamic file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileChange}
          accept={fileAccept}
          capture={fileCapture}
          className="hidden"
        />

        <div className="p-3">
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            {/* Input container */}
            <div className="relative flex min-h-[48px] flex-1 items-end items-center rounded-[24px] bg-gray-100 px-2 py-1 transition-all duration-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/20">
              {/* Emoji button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    ref={emojiButtonRef}
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleDrawer('emoji')}
                    onMouseDown={(e) => {
                      // Prevent losing focus on desktop when clicking specific buttons
                      if (!isMobile) e.preventDefault();
                    }}
                    className={`mb-0.5 h-9 w-9 rounded-full transition-colors ${
                      activeDrawer === 'emoji'
                        ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                        : 'text-gray-400 hover:bg-transparent hover:text-gray-600'
                    }
                    `}
                    aria-label="Add emoji"
                  >
                    <Smile className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Emoji</TooltipContent>
              </Tooltip>

              {/* Optimized Message Input */}
              <MessageInput
                ref={messageInputRef}
                onTyping={onTyping}
                onEmptyChange={setIsEmpty}
                onKeyDown={handleKeyDown}
                placeholder="Ketik pesan..."
              />

              {/* Attachment button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    ref={attachmentButtonRef}
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleDrawer('attachments')}
                    className={`mb-0.5 h-9 w-9 -rotate-45 rounded-full transition-colors ${
                      activeDrawer === 'attachments'
                        ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                        : 'text-gray-400 hover:bg-transparent hover:text-gray-600'
                    }
                    `}
                    aria-label="Add attachment"
                  >
                    <Paperclip className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Tambah lampiran</TooltipContent>
              </Tooltip>
            </div>

            {/* Send button */}
            {isEmpty ? (
              <Button
                type="submit"
                disabled={isEmpty}
                size="icon"
                className={`mb-0.5 h-11 w-11 shrink-0 cursor-not-allowed rounded-full bg-gray-100 text-gray-400 shadow-sm transition-all duration-200 hover:bg-gray-100`}
              >
                <Send className="ml-0.5 h-5 w-5" />
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="submit"
                    disabled={isEmpty}
                    size="icon"
                    className={`mb-0.5 h-11 w-11 shrink-0 rounded-full bg-blue-600 text-white shadow-sm transition-all duration-200 hover:bg-blue-700 active:scale-95`}
                  >
                    <Send className="ml-0.5 h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Kirim</TooltipContent>
              </Tooltip>
            )}
          </form>
        </div>
      </div>
    );
  },
);

export default memo(InputArea);
