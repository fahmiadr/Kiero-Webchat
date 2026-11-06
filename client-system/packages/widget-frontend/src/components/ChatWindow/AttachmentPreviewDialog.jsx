import { AsyncQueuer, Debouncer, Throttler } from '@tanstack/pacer';
import { AnimatePresence, m } from 'framer-motion';
import { CloudUpload, Loader2, Music, Plus, Send, Smile, X } from 'lucide-react';
import { forwardRef, memo, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ALLOWED_FILE_TYPES_STRING,
  isFileAllowed,
  MIME_PREFIX_AUDIO,
  MIME_PREFIX_IMAGE,
  MIME_PREFIX_VIDEO,
} from '@/constants/fileTypes';
import { useDragDrop } from '@/hooks/useDragDrop';
import { acquireBlobUrl } from '@/hooks/useObjectUrl';
import { cn } from '@/utils/cn';
import { getFileIconProps } from '@/utils/fileIcons';
import { formatBytes } from '@/utils/formatUtils';
import { generateThumbnail, generateVideoThumbnail } from '@/utils/generateThumbnail';
import CustomEmojiPicker from './CustomEmojiPicker';

const FILE_PROCESSING_CONCURRENCY = 5;

const MAX_MESSAGE_LENGTH = 500;

const getGraphemeCount = (text) => {
  return [...(text || '')].length;
};

// Optimization: Separated Caption Input to prevent main dialog re-renders
const CaptionInput = memo(
  forwardRef(({ initialValue, onUpdate, onKeyDown, disabled, placeholder, className }, ref) => {
    const [value, setValue] = useState(initialValue || '');
    // Refs to track state for cleanup/flush
    const valueRef = useRef(initialValue || '');
    const lastSyncedValue = useRef(initialValue || '');
    const debouncer = useRef(null);

    // Sync input when parent switches attachment
    useEffect(() => {
      const newVal = initialValue || '';
      setValue(newVal);
      valueRef.current = newVal;
      lastSyncedValue.current = newVal;
    }, [initialValue]);

    // Initialize debouncer
    useEffect(() => {
      debouncer.current = new Debouncer(
        (val) => {
          onUpdate?.(val);
          lastSyncedValue.current = val;
        },
        { wait: 300 },
      ); // Optimize: 300ms debounce for heavy parent state update

      return () => {
        // Cleanup: Flush any pending updates on unmount/re-render
        debouncer.current?.cancel();
        if (valueRef.current !== lastSyncedValue.current) {
          onUpdate?.(valueRef.current);
        }
      };
    }, [onUpdate]);

    const handleChange = (e) => {
      const newValue = e.target.value;
      if (getGraphemeCount(newValue) > MAX_MESSAGE_LENGTH) return;

      setValue(newValue);
      valueRef.current = newValue;
      debouncer.current?.maybeExecute(newValue);
    };

    const handleBlur = () => {
      // Flush immediately on blur
      debouncer.current?.cancel();
      if (valueRef.current !== lastSyncedValue.current) {
        onUpdate?.(valueRef.current);
        lastSyncedValue.current = valueRef.current;
      }
    };

    const charCount = getGraphemeCount(value);

    return (
      <div className="relative flex flex-1">
        <Textarea
          ref={ref}
          value={value}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={className}
          rows={1}
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
                className={`pointer-events-none absolute right-4 bottom-0 font-medium text-[10px] tabular-nums transition-colors duration-200 ${charCountColor}`}
              >
                {charCount}/{MAX_MESSAGE_LENGTH}
              </span>
            );
          })()}
      </div>
    );
  }),
);

/**
 * AttachmentPreviewDialog (Light Immersive Style)
 *
 * - Fullscreen White Overlay (Matches App Theme)
 * - Immersive Layout (Overlays) but Light
 */

const selectedIndexReducer = (state, action) => {
  switch (action.type) {
    case 'NEXT':
      return Math.min(state + 1, action.max - 1);
    case 'PREV':
      return Math.max(state - 1, 0);
    case 'SET':
      return action.payload;
    default:
      return state;
  }
};

const AttachmentPreviewDialog = memo(function AttachmentPreviewDialog({
  attachments = [],
  onSend,
  onClose,
  onRemoveAttachment,
  onAddAttachment,
  onUpdateAttachment,
  onError,
}) {
  const [selectedIndex, dispatchSelectedIndex] = useReducer(selectedIndexReducer, 0);
  const [localAttachments, setLocalAttachments] = useState(() =>
    attachments.map((att) => ({ ...att, caption: att.caption || '' })),
  );

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isDraggingPreview, setIsDraggingPreview] = useState(false); // Track drag for pointer-events

  // Image Zoom State
  const [imageZoom, setImageZoom] = useState({
    scale: 1,
    translateX: 0,
    translateY: 0,
    isDragging: false,
  });

  const captionInputRef = useRef(null);
  const mediaRefs = useRef(new Map());
  const fileInputRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const imageContainerRef = useRef(null);
  const lastTapRef = useRef(0);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const initialPinchDistanceRef = useRef(0);

  // Momentum & Swipe Refs
  const velocityRef = useRef({ x: 0, y: 0 });
  const lastMoveTimeRef = useRef(0);
  const lastPositionRef = useRef({ x: 0, y: 0 });
  const momentumAnimationRef = useRef(null);
  const imageDimensionsRef = useRef({ width: 0, height: 0 });
  const swipeStartRef = useRef({ x: 0, y: 0 });
  const isSwipingRef = useRef(false); // Track if actual drag occurred
  const isDraggingPreviewRef = useRef(false); // Track if currently in drag mode
  const imageMoveThrottler = useRef(null);
  const imageTouchThrottler = useRef(null);
  const previewMoveThrottler = useRef(null);
  const previewTouchThrottler = useRef(null);

  // Sync Props
  const [prevAttachments, setPrevAttachments] = useState(attachments);
  if (attachments !== prevAttachments) {
    setPrevAttachments(attachments);
    const merged = attachments.map((newAtt) => {
      const existing = localAttachments.find((l) => l.id === newAtt.id);
      return existing
        ? { ...newAtt, caption: existing.caption }
        : { ...newAtt, caption: newAtt.caption || '' };
    });
    setLocalAttachments(merged);
    if (selectedIndex >= merged.length) {
      dispatchSelectedIndex({ type: 'SET', payload: Math.max(0, merged.length - 1) });
    }
  }

  const selectedAttachment = localAttachments[selectedIndex];
  const isImage = selectedAttachment?.type === 'image';

  // FIX 2: handleCaptionChange
  // This is now called by CaptionInput (which debounces it)
  const handleCaptionChange = (val) => {
    if (val.length > 500) return;
    setLocalAttachments((prev) =>
      prev.map((att, i) => (i === selectedIndex ? { ...att, caption: val } : att)),
    );

    // Sync with parent immediately (since input is already debounced)
    if (selectedAttachment && onUpdateAttachment) {
      onUpdateAttachment(selectedAttachment.id, { caption: val });
    }
  };

  const handleEmojiSelect = (emoji) => {
    if (!selectedAttachment) return;
    const newCaption = (selectedAttachment.caption || '') + emoji.native;
    if (newCaption.length <= 500) handleCaptionChange(newCaption);
  };

  useEffect(() => {
    mediaRefs.current.forEach((el) => {
      if (el && !el.paused) el.pause();
    });
    // Reset zoom when switching attachments
    setImageZoom({ scale: 1, translateX: 0, translateY: 0, isDragging: false });

    // Cancel any ongoing momentum animation
    if (momentumAnimationRef.current) {
      cancelAnimationFrame(momentumAnimationRef.current);
      momentumAnimationRef.current = null;
    }
    velocityRef.current = { x: 0, y: 0 };
  }, [selectedIndex]);

  useEffect(() => {
    if (selectedAttachment?.type !== 'audio' && captionInputRef.current) {
      captionInputRef.current.focus();
    }
  }, [selectedIndex, selectedAttachment]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (emojiButtonRef.current?.contains(e.target)) return;
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  // Document-level event listeners for swipe - captures events outside containers
  // Store initial zoom in state, no cascading setState inside effect
  // Ignore react-doctor cascading state warning as this is an explicit initialization block
  useEffect(() => {
    const handleDocMouseMove = (e) => {
      if (!isDraggingPreviewRef.current) return;

      const deltaX = Math.abs(e.clientX - swipeStartRef.current.x);
      if (deltaX > 5) {
        isSwipingRef.current = true;
      }
      lastPositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleDocMouseUp = () => {
      if (!isDraggingPreviewRef.current) return;

      isDraggingPreviewRef.current = false;
      setIsDraggingPreview(false); // Re-enable UI pointer events

      // Only trigger swipe if we have multiple attachments
      if (localAttachments.length > 1 && isSwipingRef.current) {
        const deltaX = lastPositionRef.current.x - swipeStartRef.current.x;

        if (Math.abs(deltaX) > 50) {
          if (deltaX < 0 && selectedIndex < localAttachments.length - 1) {
            dispatchSelectedIndex({ type: 'NEXT', max: localAttachments.length });
          } else if (deltaX > 0 && selectedIndex > 0) {
            dispatchSelectedIndex({ type: 'PREV' });
          }
        }
      }

      // Reset
      isSwipingRef.current = false;
      swipeStartRef.current = { x: 0, y: 0 };
      lastPositionRef.current = { x: 0, y: 0 };
    };

    const handleDocTouchEnd = () => {
      if (!isDraggingPreviewRef.current) return;
      handleDocMouseUp();
    };

    document.addEventListener('mousemove', handleDocMouseMove);
    document.addEventListener('mouseup', handleDocMouseUp);
    document.addEventListener('touchend', handleDocTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('mousemove', handleDocMouseMove);
      document.removeEventListener('mouseup', handleDocMouseUp);
      document.removeEventListener('touchend', handleDocTouchEnd);
    };
  }, [localAttachments.length, selectedIndex]);

  // Native wheel event listener with { passive: false } to allow preventDefault
  useEffect(() => {
    const container = imageContainerRef.current;
    const attachmentIsImage = selectedAttachment?.type === 'image';
    if (!container || !attachmentIsImage) return;

    const handleWheel = (e) => {
      e.preventDefault();

      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newScale = Math.min(Math.max(1, imageZoom.scale + delta), 4);

      if (newScale === 1) {
        setImageZoom({ scale: 1, translateX: 0, translateY: 0, isDragging: false });
      } else {
        setImageZoom((prev) => ({ ...prev, scale: newScale }));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: true });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [selectedAttachment?.type, imageZoom.scale]);

  // Actions
  const handleAddFiles = async (files) => {
    if (!files || files.length === 0) return;

    const validFiles = [];
    const invalidFiles = [];

    files.forEach((file) => {
      if (isFileAllowed(file)) {
        validFiles.push(file);
      } else {
        invalidFiles.push(file);
      }
    });

    if (invalidFiles.length > 0) {
      const invalidNames = invalidFiles.map((f) => f.name).join(', ');
      const invalidExtensions = [
        ...new Set(
          invalidFiles
            .map((f) => {
              const parts = f.name.split('.');
              return parts.length > 1 ? `.${parts.pop()}` : '';
            })
            .filter(Boolean),
        ),
      ].join(', ');

      onError?.(`File ${invalidExtensions} tidak didukung: ${invalidNames}`);
    }

    if (validFiles.length === 0) return;

    // 1. Create and Add Placeholders immediately
    const placeholders = validFiles.map((file, index) => {
      let type = 'document';
      const mimeType = file.type || '';
      if (mimeType.startsWith(MIME_PREFIX_IMAGE)) type = 'image';
      else if (mimeType.startsWith(MIME_PREFIX_VIDEO)) type = 'video';
      else if (mimeType.startsWith(MIME_PREFIX_AUDIO)) type = 'audio';

      const id = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 11)}`;

      return {
        id,
        file,
        type,
        previewUrl: null, // Will be generated
        thumbnailUrl: null,
        thumbnailData: null,
        caption: '',
        isLoading: true, // Mark as loading
      };
    });

    if (onAddAttachment) {
      onAddAttachment(placeholders);
    } else {
      setLocalAttachments((prev) => [...prev, ...placeholders]);
    }

    // 2. Process Files Concurrently (AsyncQueuer, max 5)
    const processingQueue = new AsyncQueuer(
      async (placeholder) => {
        const { file, type } = placeholder;

        // Use registry for proper blob URL management
        const previewUrl = acquireBlobUrl(file);
        let thumbnailUrl = null;
        let thumbnailData = null;

        if (type === 'image') {
          const thumbResult = await generateThumbnail(previewUrl);
          if (thumbResult) {
            thumbnailData = thumbResult;
            thumbnailUrl = acquireBlobUrl(thumbResult.blob);
          }
        } else if (type === 'video') {
          try {
            const thumbResult = await generateVideoThumbnail(previewUrl);
            if (thumbResult) {
              thumbnailData = thumbResult;
              thumbnailUrl = acquireBlobUrl(thumbResult.blob);
            }
          } catch {
            // Fallback or ignore
          }
        }

        const updates = { previewUrl, thumbnailUrl, thumbnailData, isLoading: false };

        // Update attachment with result
        if (onUpdateAttachment) {
          onUpdateAttachment(placeholder.id, updates);
        } else {
          setLocalAttachments((prev) =>
            prev.map((a) => (a.id === placeholder.id ? { ...a, ...updates } : a)),
          );
        }
      },
      {
        concurrency: FILE_PROCESSING_CONCURRENCY,
        started: true,
      },
    );

    // Queue all placeholders for concurrent processing
    placeholders.forEach((placeholder) => {
      processingQueue.addItem(placeholder);
    });
  };

  const handleFileInputChange = (e) => {
    const files = Array.from(e.target.files);
    handleAddFiles(files);
    e.target.value = '';
  };

  const { isDragging, dragHandlers } = useDragDrop(handleAddFiles, onError);

  const handleSendAction = useCallback(async () => {
    const finalAttachmentsPromises = localAttachments.map(async (att, index) => {
      // Use current input value for selected attachment to capture undebounced changes
      const currentCaption =
        index === selectedIndex && captionInputRef.current
          ? captionInputRef.current.value
          : att.caption;

      const effectiveAtt = { ...att, caption: currentCaption };

      if (
        effectiveAtt.type === 'video' &&
        (!effectiveAtt.thumbnailUrl || !effectiveAtt.thumbnailData)
      ) {
        try {
          const thumbResult = await generateVideoThumbnail(effectiveAtt.file);
          if (thumbResult) {
            return {
              ...effectiveAtt,
              thumbnailUrl: URL.createObjectURL(thumbResult.blob),
              thumbnailData: thumbResult,
            };
          }
        } catch {
          /* ignore fallback */
        }
      }
      return effectiveAtt;
    });
    const finalAttachments = await Promise.all(finalAttachmentsPromises);
    onSend(finalAttachments);
  }, [localAttachments, onSend, selectedIndex]);

  const handleRemove = (e, id) => {
    e.stopPropagation();
    onRemoveAttachment(id);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendAction();
    }
  };

  // Swipe threshold in pixels
  const SWIPE_THRESHOLD = 50;

  // Boundary constraint function - prevents image from leaving screen
  const clampTranslation = useCallback((translateX, translateY, scale) => {
    const container = imageContainerRef.current;
    const imgDims = imageDimensionsRef.current;
    if (!container || !imgDims.width) return { translateX, translateY };

    const containerRect = container.getBoundingClientRect();
    const scaledWidth = imgDims.width * scale;
    const scaledHeight = imgDims.height * scale;

    // Image edge can touch opposite screen edge, but not beyond
    const maxX = Math.max(0, (scaledWidth - containerRect.width) / 2 + containerRect.width);
    const maxY = Math.max(0, (scaledHeight - containerRect.height) / 2 + containerRect.height);

    return {
      translateX: Math.max(-maxX, Math.min(maxX, translateX)),
      translateY: Math.max(-maxY, Math.min(maxY, translateY)),
    };
  }, []);

  // Swipe-to-switch for all attachment types
  const handleSwipeEnd = useCallback(() => {
    // Only process if actual swipe occurred
    if (!isSwipingRef.current) return;
    if (localAttachments.length <= 1) return;

    const deltaX = lastPositionRef.current.x - swipeStartRef.current.x;

    if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
      if (deltaX < 0 && selectedIndex < localAttachments.length - 1) {
        dispatchSelectedIndex({ type: 'NEXT', max: localAttachments.length });
      } else if (deltaX > 0 && selectedIndex > 0) {
        dispatchSelectedIndex({ type: 'PREV' });
      }
    }

    // Reset swipe state
    isSwipingRef.current = false;
    swipeStartRef.current = { x: 0, y: 0 };
    lastPositionRef.current = { x: 0, y: 0 };
  }, [localAttachments.length, selectedIndex]);

  // Momentum animation for flick gesture
  const applyMomentum = useCallback(() => {
    const friction = 0.95; // iOS-like deceleration
    const minVelocity = 0.5;

    const animate = () => {
      velocityRef.current.x *= friction;
      velocityRef.current.y *= friction;

      if (
        Math.abs(velocityRef.current.x) < minVelocity &&
        Math.abs(velocityRef.current.y) < minVelocity
      ) {
        cancelAnimationFrame(momentumAnimationRef.current);
        return;
      }

      setImageZoom((prev) => {
        const newX = prev.translateX + velocityRef.current.x;
        const newY = prev.translateY + velocityRef.current.y;
        const clamped = clampTranslation(newX, newY, prev.scale);

        // Stop momentum if hitting boundary
        if (clamped.translateX !== newX) velocityRef.current.x = 0;
        if (clamped.translateY !== newY) velocityRef.current.y = 0;

        return { ...prev, ...clamped };
      });

      momentumAnimationRef.current = requestAnimationFrame(animate);
    };
    momentumAnimationRef.current = requestAnimationFrame(animate);
  }, [clampTranslation]);

  // Image Zoom Handlers
  const handleImageDoubleClick = (e) => {
    if (!isImage) return;
    e.preventDefault();

    if (imageZoom.scale > 1) {
      // Zoom out
      setImageZoom({ scale: 1, translateX: 0, translateY: 0, isDragging: false });
    } else {
      // Zoom in to 2x at click point
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      setImageZoom({
        scale: 2,
        translateX: (centerX - x) * 0.5,
        translateY: (centerY - y) * 0.5,
        isDragging: false,
      });
    }
  };

  const handleImageMouseDown = (e) => {
    if (!isImage) return;
    e.preventDefault();

    // Enable UI pointer-events disabling for all image drags
    isDraggingPreviewRef.current = true;
    setIsDraggingPreview(true);

    // Reset swipe state
    isSwipingRef.current = false;
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
    lastPositionRef.current = { x: e.clientX, y: e.clientY };
    lastMoveTimeRef.current = performance.now();
    velocityRef.current = { x: 0, y: 0 };

    // Cancel any ongoing momentum animation
    if (momentumAnimationRef.current) {
      cancelAnimationFrame(momentumAnimationRef.current);
    }

    if (imageZoom.scale > 1) {
      setImageZoom((prev) => ({ ...prev, isDragging: true }));
      dragStartRef.current = {
        x: e.clientX - imageZoom.translateX,
        y: e.clientY - imageZoom.translateY,
      };
    }
  };

  // Throttled Handlers Logic
  const performImageMouseMove = useCallback(
    (e, zoomState) => {
      if (!isImage) return;

      const now = performance.now();
      const dt = now - lastMoveTimeRef.current;

      if (zoomState.scale > 1 && zoomState.isDragging) {
        const newX = e.clientX - dragStartRef.current.x;
        const newY = e.clientY - dragStartRef.current.y;

        // Track velocity with smoothing (EMA)
        if (dt > 0) {
          const alpha = 0.3; // Smoothing factor (0-1). Lower = smoother/slower reaction to spikes

          // Calculate instant velocity using SCREEN coordinates (not translation)
          let instantVx = ((e.clientX - lastPositionRef.current.x) / dt) * 16;
          let instantVy = ((e.clientY - lastPositionRef.current.y) / dt) * 16;

          // Hard cap instant velocity
          instantVx = Math.max(-100, Math.min(100, instantVx));
          instantVy = Math.max(-100, Math.min(100, instantVy));

          velocityRef.current = {
            x: velocityRef.current.x * (1 - alpha) + instantVx * alpha,
            y: velocityRef.current.y * (1 - alpha) + instantVy * alpha,
          };
        }
        // If dt is 0 or negative (clock skew?), keep previous velocity

        lastMoveTimeRef.current = now;
        lastPositionRef.current = { x: e.clientX, y: e.clientY };

        // Apply boundary constraints
        const clamped = clampTranslation(newX, newY, zoomState.scale);
        setImageZoom((prev) => ({ ...prev, ...clamped }));
      } else if (zoomState.scale === 1) {
        // Track position for swipe detection - mark as swiping if moved beyond threshold
        const deltaX = Math.abs(e.clientX - swipeStartRef.current.x);
        if (deltaX > 5) {
          isSwipingRef.current = true;
        }
        lastPositionRef.current = { x: e.clientX, y: e.clientY };
      }
    },
    [isImage, clampTranslation],
  );

  const performImageTouchMove = useCallback(
    (e, zoomState) => {
      if (!isImage) return;

      if (e.touches.length === 2) {
        // Pinch zoom
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY,
        );

        if (initialPinchDistanceRef.current > 0) {
          const scale = (distance / initialPinchDistanceRef.current) * zoomState.scale;
          const newScale = Math.min(Math.max(1, scale), 4);

          if (newScale === 1) {
            setImageZoom({ scale: 1, translateX: 0, translateY: 0, isDragging: false });
          } else {
            setImageZoom((prev) => ({ ...prev, scale: newScale }));
          }
        }
      } else if (e.touches.length === 1) {
        const now = performance.now();
        const dt = now - lastMoveTimeRef.current;

        if (zoomState.isDragging && zoomState.scale > 1) {
          // Pan with velocity tracking
          const newX = e.touches[0].clientX - dragStartRef.current.x;
          const newY = e.touches[0].clientY - dragStartRef.current.y;

          // Track velocity with smoothing (EMA)
          if (dt > 0) {
            const alpha = 0.3;

            // Calculate instant velocity using SCREEN coordinates (not translation)
            let instantVx = ((e.touches[0].clientX - lastPositionRef.current.x) / dt) * 16;
            let instantVy = ((e.touches[0].clientY - lastPositionRef.current.y) / dt) * 16;

            // Hard cap instant velocity
            instantVx = Math.max(-100, Math.min(100, instantVx));
            instantVy = Math.max(-100, Math.min(100, instantVy));

            velocityRef.current = {
              x: velocityRef.current.x * (1 - alpha) + instantVx * alpha,
              y: velocityRef.current.y * (1 - alpha) + instantVy * alpha,
            };
          }

          lastMoveTimeRef.current = now;
          lastPositionRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

          // Apply boundary constraints
          const clamped = clampTranslation(newX, newY, zoomState.scale);
          setImageZoom((prev) => ({ ...prev, ...clamped }));
        } else if (zoomState.scale === 1) {
          // Track position for swipe detection - mark as swiping if moved beyond threshold
          const deltaX = Math.abs(e.touches[0].clientX - swipeStartRef.current.x);
          if (deltaX > 5) {
            isSwipingRef.current = true;
          }
          lastPositionRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
      }
    },
    [isImage, clampTranslation],
  );

  const performPreviewMove = useCallback(
    (e) => {
      if (!isDraggingPreviewRef.current) return;
      // For zoomed images, let image handlers take over
      if (isImage && imageZoom.scale > 1) return;

      const clientX = e.clientX || e.touches?.[0]?.clientX;
      const clientY = e.clientY || e.touches?.[0]?.clientY;

      if (clientX === undefined) return;

      const deltaX = Math.abs(clientX - swipeStartRef.current.x);
      if (deltaX > 5) {
        isSwipingRef.current = true;
      }
      lastPositionRef.current = { x: clientX, y: clientY };
    },
    [isImage, imageZoom.scale],
  );

  // Initialize Throttlers
  useEffect(() => {
    imageMoveThrottler.current = new Throttler(performImageMouseMove, { wait: 16 });
    imageTouchThrottler.current = new Throttler(performImageTouchMove, { wait: 16 });
    previewMoveThrottler.current = new Throttler(performPreviewMove, { wait: 16 });
    previewTouchThrottler.current = new Throttler(performPreviewMove, { wait: 16 });

    return () => {
      imageMoveThrottler.current?.cancel();
      imageTouchThrottler.current?.cancel();
      previewMoveThrottler.current?.cancel();
      previewTouchThrottler.current?.cancel();
    };
  }, [performImageMouseMove, performImageTouchMove, performPreviewMove]);

  const handleImageMouseMove = (e) => {
    if (!isImage) return;
    if (imageZoom.scale > 1 && imageZoom.isDragging) {
      e.preventDefault();
    }
    imageMoveThrottler.current?.maybeExecute(e, imageZoom);
  };

  const handleImageMouseUp = () => {
    if (!isImage) return;

    // Re-enable UI pointer events
    isDraggingPreviewRef.current = false;
    setIsDraggingPreview(false);

    setImageZoom((prev) => ({ ...prev, isDragging: false }));

    if (imageZoom.scale === 1) {
      // Swipe-to-switch
      handleSwipeEnd();
    } else {
      // Apply momentum if flicked
      // If drag stopped for > 50ms, assume velocity is 0 (no momentum)
      const timeSinceLastMove = performance.now() - lastMoveTimeRef.current;
      if (timeSinceLastMove > 50) {
        velocityRef.current = { x: 0, y: 0 };
      }

      const speed = Math.hypot(velocityRef.current.x, velocityRef.current.y);
      if (speed > 2) {
        applyMomentum();
      }
    }
  };

  // Global swipe handlers for non-image attachments
  const handlePreviewMouseDown = (e) => {
    // Skip if clicking on interactive elements
    const target = e.target;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('[data-no-swipe]')
    ) {
      return;
    }

    // For zoomed images, let image handlers take over
    if (isImage && imageZoom.scale > 1) return;

    isDraggingPreviewRef.current = true;
    setIsDraggingPreview(true); // Disable UI pointer events
    isSwipingRef.current = false;
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
    lastPositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePreviewMouseMove = (e) => {
    if (!isDraggingPreviewRef.current) return;
    // For zoomed images, let image handlers take over
    if (isImage && imageZoom.scale > 1) return;
    previewMoveThrottler.current?.maybeExecute(e);
  };

  const handlePreviewMouseUp = () => {
    if (!isDraggingPreviewRef.current) return;
    // For zoomed images, let image handlers take over
    if (isImage && imageZoom.scale > 1) return;

    isDraggingPreviewRef.current = false;
    setIsDraggingPreview(false);
    handleSwipeEnd();
  };

  const handleImageTouchStart = (e) => {
    if (!isImage) return;

    // Cancel any ongoing momentum animation
    if (momentumAnimationRef.current) {
      cancelAnimationFrame(momentumAnimationRef.current);
    }

    if (e.touches.length === 2) {
      // Pinch zoom start
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      initialPinchDistanceRef.current = distance;
    } else if (e.touches.length === 1) {
      // Check for double tap
      const now = Date.now();
      const timeSinceLastTap = now - lastTapRef.current;

      if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
        // Double tap detected
        handleImageDoubleClick(e.touches[0]);
      }
      lastTapRef.current = now;

      // Enable UI pointer-events disabling for all image drags
      isDraggingPreviewRef.current = true;
      setIsDraggingPreview(true);

      // Reset swipe state
      isSwipingRef.current = false;
      swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastPositionRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastMoveTimeRef.current = performance.now();
      velocityRef.current = { x: 0, y: 0 };

      // Start drag if zoomed
      if (imageZoom.scale > 1) {
        setImageZoom((prev) => ({ ...prev, isDragging: true }));
        dragStartRef.current = {
          x: e.touches[0].clientX - imageZoom.translateX,
          y: e.touches[0].clientY - imageZoom.translateY,
        };
      }
    }
  };

  const handleImageTouchMove = (e) => {
    if (!isImage) return;
    if (e.touches.length === 2 || (imageZoom.isDragging && imageZoom.scale > 1)) {
      e.preventDefault();
    }
    imageTouchThrottler.current?.maybeExecute(e, imageZoom);
  };

  const handleImageTouchEnd = (e) => {
    if (!isImage) return;

    if (e.touches.length === 0) {
      // Re-enable UI pointer events
      isDraggingPreviewRef.current = false;
      setIsDraggingPreview(false);

      setImageZoom((prev) => ({ ...prev, isDragging: false }));
      initialPinchDistanceRef.current = 0;

      if (imageZoom.scale === 1) {
        // Swipe-to-switch
        handleSwipeEnd();
      } else {
        // Apply momentum if flicked
        // If drag stopped for > 50ms, assume velocity is 0 (no momentum)
        const timeSinceLastMove = performance.now() - lastMoveTimeRef.current;
        if (timeSinceLastMove > 50) {
          velocityRef.current = { x: 0, y: 0 };
        }

        const speed = Math.hypot(velocityRef.current.x, velocityRef.current.y);
        if (speed > 2) {
          applyMomentum();
        }
      }
    } else if (e.touches.length === 1) {
      initialPinchDistanceRef.current = 0;
    }
  };

  // Global touch handlers for non-image attachments
  const handlePreviewTouchStart = (e) => {
    // Skip if touching interactive elements
    const target = e.target;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('[data-no-swipe]')
    ) {
      return;
    }

    // For zoomed images, let image handlers take over
    if (isImage && imageZoom.scale > 1) return;

    if (e.touches.length === 1) {
      isDraggingPreviewRef.current = true;
      setIsDraggingPreview(true); // Disable UI pointer events
      isSwipingRef.current = false;
      swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastPositionRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handlePreviewTouchMove = (e) => {
    if (!isDraggingPreviewRef.current) return;
    // For zoomed images, let image handlers take over
    if (isImage && imageZoom.scale > 1) return;
    previewTouchThrottler.current?.maybeExecute(e);
  };

  const handlePreviewTouchEnd = (e) => {
    if (!isDraggingPreviewRef.current) return;
    // For zoomed images, let image handlers take over
    if (isImage && imageZoom.scale > 1) return;

    if (e.touches.length === 0) {
      isDraggingPreviewRef.current = false;
      setIsDraggingPreview(false); // Re-enable UI pointer events
      handleSwipeEnd();
    }
  };

  if (!selectedAttachment) return null;

  const { file, type, isLoading } = selectedAttachment;
  const isVideo = type === 'video';
  const isAudio = type === 'audio';
  const { Icon, iconClass } = getFileIconProps(file.name, file.type);

  // Render thumbnail for an attachment
  const renderThumbnail = (att, index) => {
    const isSelected = index === selectedIndex;
    const isImage = att.type === 'image';
    const hasCaption = att.caption && att.caption.trim().length > 0;

    // Helper to get styling based on file extension/type
    // Use standard icon utility
    const { Icon, iconClass, containerClass } = getFileIconProps(att.file.name, att.file.type);

    return (
      // biome-ignore lint/a11y/useSemanticElements: Hydration issue with nested buttons
      <div
        role="button"
        tabIndex={0}
        key={att.id}
        className={`group relative h-14 w-14 flex-shrink-0 cursor-pointer rounded-sm border-0 bg-transparent p-0 transition-all duration-200 hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${isDraggingPreview ? 'pointer-events-none' : 'pointer-events-auto'}`}
        onClick={() => dispatchSelectedIndex({ type: 'SET', payload: index })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            dispatchSelectedIndex({ type: 'SET', payload: index });
          }
        }}
      >
        {/* Content Container with Border/Radius/Overflow - Standalone with own background */}
        <div
          className={`h-full w-full overflow-hidden rounded-md shadow-md backdrop-blur-sm transition-all duration-300 ease-out ${
            isSelected
              ? 'scale-105 border border-transparent bg-white ring-2 ring-primary-600'
              : 'scale-100 border border-slate-200 bg-white hover:border-primary-400'
          } flex items-center justify-center ${isImage ? '' : containerClass}`}
        >
          {isImage && (att.thumbnailUrl || att.previewUrl) ? (
            <img
              src={att.thumbnailUrl || att.previewUrl}
              alt={att.file.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="relative flex h-full w-full flex-col items-center justify-center">
              <Icon className={iconClass} />
            </div>
          )}
          {/* Loading Overlay for Thumbnail */}
          {att.isLoading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
              <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
            </div>
          )}
        </div>

        {/* Caption indicator */}
        {hasCaption && att.type !== 'audio' && (
          <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-10 flex justify-center pb-0.5">
            <Badge
              variant="secondary"
              className="h-3 rounded-none rounded-t-sm border-0 bg-black/60 px-1 py-0.5 text-[8px]"
            >
              <span className="h-1 w-1 rounded-full bg-white/90" />
            </Badge>
          </div>
        )}

        {/* Remove button - Floating Outside */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(e, att.id);
              }}
              className={`absolute -top-2 -right-2 z-20 h-5 w-5 rounded-full bg-red-500 p-0 text-white shadow-md ring-1 ring-white transition-all hover:bg-red-600 ${isSelected ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'}`}
            >
              <X className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Hapus</p>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  };

  // Animation Variants - Water Droplet / Ripple Effect (Copied from InputArea)
  const drawerVariants = {
    hidden: (custom) => ({
      clipPath:
        custom === 'emoji'
          ? 'circle(0% at 0% 100%)' // Start from bottom-left
          : 'circle(0% at 100% 100%)', // Start from bottom-right (unused here but kept for completeness)
      opacity: 0,
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

  return (
    <div
      className="fade-in absolute inset-0 z-50 flex animate-in flex-col bg-white font-sans duration-200"
      {...dragHandlers}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-[60] m-4 flex items-center justify-center rounded-xl border-2 border-primary-500 border-dashed bg-widget-bg/90 backdrop-blur-sm">
          <div className="fade-in zoom-in-95 flex animate-in flex-col items-center justify-center text-primary-600 duration-200">
            <div className="mb-4 rounded-full bg-primary-50 p-4">
              <CloudUpload className="h-12 w-12" />
            </div>
            <h3 className="font-semibold text-xl">Drop files here</h3>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ALLOWED_FILE_TYPES_STRING}
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Header - Clean with Overlay Background */}
      <div
        className={`absolute top-0 right-0 left-0 z-20 flex items-center justify-between px-4 py-3 ${isDraggingPreview ? 'pointer-events-none' : 'pointer-events-auto'} bg-gradient-to-r from-blue-600/60 via-blue-700/60 to-indigo-700/60 transition-colors`}
      >
        <div className={`flex items-center gap-3`}>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onClose(localAttachments)}
                className="h-9 w-9 shrink-0 rounded-full bg-white/90 text-slate-800 shadow-sm hover:bg-white"
              >
                <X className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Tutup</TooltipContent>
          </Tooltip>

          <div className="flex flex-col rounded-lg px-3 py-1.5">
            <span className="line-clamp-1 break-all font-medium text-sm text-white drop-shadow-sm">
              {file.name}
            </span>
            {localAttachments.length > 1 && (
              <span className="text-white/80 text-xs drop-shadow-sm">
                {selectedIndex + 1} of {localAttachments.length}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Preview */}
      <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden bg-white">
        {/* biome-ignore lint/a11y/noStaticElementInteractions: Gesture area for swipe/drag */}
        <div
          role="presentation"
          className="relative flex h-full w-full items-center justify-center"
          onMouseDown={handlePreviewMouseDown}
          onMouseMove={handlePreviewMouseMove}
          onMouseUp={handlePreviewMouseUp}
          onTouchStart={handlePreviewTouchStart}
          onTouchMove={handlePreviewTouchMove}
          onTouchEnd={handlePreviewTouchEnd}
        >
          {/* Loading Overlay for Main Preview */}
          {isLoading && (
            <div className="fade-in absolute inset-0 z-30 flex animate-in flex-col items-center justify-center bg-white/80 backdrop-blur-sm duration-200">
              <Loader2 className="mb-3 h-10 w-10 animate-spin text-primary-600" />
              <span className="font-medium text-slate-500 text-sm">Memproses preview...</span>
            </div>
          )}

          {/* Image */}
          {isImage && (
            // biome-ignore lint/a11y/noStaticElementInteractions: Image viewer gestures
            <div
              role="presentation"
              ref={imageContainerRef}
              className="relative flex h-full w-full cursor-default items-center justify-center"
              onDoubleClick={handleImageDoubleClick}
              onMouseDown={handleImageMouseDown}
              onMouseMove={handleImageMouseMove}
              onMouseUp={handleImageMouseUp}
              onTouchStart={handleImageTouchStart}
              onTouchMove={handleImageTouchMove}
              onTouchEnd={handleImageTouchEnd}
            >
              {selectedAttachment.previewUrl && (
                <img
                  src={selectedAttachment.previewUrl}
                  alt="Preview"
                  className="max-h-full max-w-full select-none object-contain"
                  onLoad={(e) => {
                    const img = e.target;
                    imageDimensionsRef.current = {
                      width: img.clientWidth,
                      height: img.clientHeight,
                    };
                  }}
                  style={{
                    transform: `scale(${imageZoom.scale}) translate(${imageZoom.translateX / imageZoom.scale}px, ${imageZoom.translateY / imageZoom.scale}px)`,
                    transition:
                      imageZoom.isDragging || momentumAnimationRef.current
                        ? 'none'
                        : 'transform 0.2s ease-out',
                    cursor: (() => {
                      if (imageZoom.scale <= 1) return 'default';
                      return imageZoom.isDragging ? 'grabbing' : 'grab';
                    })(),
                  }}
                  draggable={false}
                />
              )}
            </div>
          )}

          {/* Video */}
          {isVideo && (
            <div className="flex h-full w-full flex-col items-center justify-center">
              {selectedAttachment.previewUrl && (
                // biome-ignore lint/a11y/useMediaCaption: Video previews do not have text tracks
                <video
                  ref={(el) =>
                    el
                      ? mediaRefs.current.set(selectedAttachment.id, el)
                      : mediaRefs.current.delete(selectedAttachment.id)
                  }
                  src={selectedAttachment.previewUrl}
                  controls
                  className="mb-24 max-h-[60%] max-w-full rounded-lg bg-black/5 shadow-sm"
                  playsInline
                />
              )}
            </div>
          )}

          {/* Audio */}
          {isAudio && (
            <div className="mb-12 flex w-full flex-col items-center justify-center py-8">
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-slate-200 bg-slate-100">
                <Music className="h-10 w-10 text-slate-600" />
              </div>
              <span className="mb-8 line-clamp-2 max-w-xs break-all text-center font-medium text-base text-slate-900">
                {file.name}
              </span>
              <div className="w-full max-w-sm px-4">
                {selectedAttachment.previewUrl && (
                  // biome-ignore lint/a11y/useMediaCaption: Audio previews do not have text tracks
                  <audio
                    ref={(el) =>
                      el
                        ? mediaRefs.current.set(selectedAttachment.id, el)
                        : mediaRefs.current.delete(selectedAttachment.id)
                    }
                    src={selectedAttachment.previewUrl}
                    controls
                    className="h-10 w-full"
                  />
                )}
              </div>
            </div>
          )}

          {/* Document */}
          {!isImage && !isVideo && !isAudio && (
            <div className="mb-12 flex flex-col items-center justify-center py-8">
              <div className="flex flex-col items-center p-6">
                <Icon className={cn('mb-6 text-slate-400 opacity-80', iconClass, 'h-32 w-32')} />
                <span className="max-w-[240px] truncate text-center font-medium text-base text-slate-900">
                  {file.name}
                </span>
                <span className="mt-2 text-slate-500 text-sm">{formatBytes(file.size)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-20 pb-4">
        <div className="space-y-3">
          {/* Thumbnail Strip - Standalone Thumbnails */}
          <div className="pointer-events-none flex justify-center">
            <ScrollArea className="pointer-events-none w-full">
              <div className="mx-auto mb-1 flex w-max items-center gap-3 px-4 py-2.5">
                {localAttachments.map((att, idx) => renderThumbnail(att, idx))}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      type="button"
                      className={`flex h-14 w-14 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-300 border-dashed bg-white p-0 text-slate-400 shadow-md backdrop-blur-sm transition-colors hover:border-slate-400 hover:bg-slate-50 ${isDraggingPreview ? 'pointer-events-none' : 'pointer-events-auto'}`}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Tambah lampiran</TooltipContent>
                </Tooltip>
              </div>
              <ScrollBar
                orientation="horizontal"
                className={`h-1.5 bg-slate-100/80 [&>div]:bg-slate-400 hover:[&>div]:bg-slate-500 ${isDraggingPreview ? 'pointer-events-none' : 'pointer-events-auto'}`}
              />
            </ScrollArea>
          </div>

          {/* Input Area - Standalone Elements */}
          <div className="pointer-events-none relative mx-auto flex max-w-4xl items-end justify-center gap-2 px-4">
            <AnimatePresence>
              {showEmojiPicker && (
                <m.div
                  key="emoji-drawer"
                  ref={emojiPickerRef}
                  custom="emoji"
                  variants={drawerVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className={`absolute right-0 bottom-full left-0 z-50 mb-2 h-[350px] origin-bottom-left overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ${isDraggingPreview ? 'pointer-events-none' : 'pointer-events-auto'}`}
                >
                  <CustomEmojiPicker onSelect={handleEmojiSelect} />
                </m.div>
              )}
            </AnimatePresence>

            <div
              className={`relative flex flex-1 items-end gap-1 rounded-[24px] border border-slate-200 bg-white px-2 py-1.5 shadow-lg backdrop-blur-sm transition-all focus-within:ring-2 focus-within:ring-primary-500/30 ${isDraggingPreview ? 'pointer-events-none' : 'pointer-events-auto'} ${isAudio ? 'cursor-not-allowed bg-slate-100 opacity-60' : ''}`}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    ref={emojiButtonRef}
                    variant="ghost"
                    size="icon"
                    onClick={() => !isAudio && setShowEmojiPicker((prev) => !prev)}
                    onMouseDown={(e) => e.stopPropagation()} // Stop propagation to prevent document handler from firing
                    disabled={isAudio}
                    className={cn(
                      'mb-0.5 h-9 w-9 rounded-full text-gray-400 hover:bg-transparent hover:text-gray-600',
                      showEmojiPicker && 'bg-blue-50 text-blue-600 hover:bg-blue-100',
                      isAudio && 'cursor-not-allowed hover:bg-transparent',
                    )}
                  >
                    <Smile className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Emoji</TooltipContent>
              </Tooltip>
              <CaptionInput
                ref={captionInputRef}
                key={selectedAttachment.id} // Reset on switch
                initialValue={isAudio ? '' : selectedAttachment.caption}
                onUpdate={handleCaptionChange}
                onKeyDown={handleKeyPress}
                disabled={isAudio}
                placeholder={
                  isAudio ? 'Keterangan tidak tersedia untuk audio' : 'Tambah keterangan...'
                }
                className={cn(
                  'max-h-[100px] min-h-[24px] flex-1 resize-none border-none bg-transparent p-2 text-foreground text-sm shadow-none outline-none placeholder:text-slate-400 focus-visible:ring-0 focus-visible:ring-offset-0',
                  isAudio && 'cursor-not-allowed placeholder:text-slate-500',
                )}
              />
            </div>

            {/* Send Button - Standalone */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleSendAction}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-600 p-0 text-white shadow-xl transition-all duration-200 hover:bg-primary-500 hover:shadow-2xl active:scale-95 ${isDraggingPreview ? 'pointer-events-none' : 'pointer-events-auto'}`}
                >
                  <Send className="ml-0.5 h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Kirim</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
});

export default AttachmentPreviewDialog;
