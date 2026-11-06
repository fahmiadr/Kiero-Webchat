import { AnimatePresence } from 'framer-motion';
import { CloudUpload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useChatAttachments } from '@/hooks/useChatAttachments';
import { useChatSocket } from '@/hooks/useChatSocket';
import { useDragDrop } from '@/hooks/useDragDrop';
import { useChatStore } from '@/stores/chatStore';

import AttachmentPreviewDialog from './AttachmentPreviewDialog';
import Header from './Header';
import InputArea from './InputArea';
import LocationPicker from './location/LocationPicker';
import MessageList from './MessageList';
import ScrollToBottomFAB from './ScrollToBottomFAB';
import Toast from './Toast';

/**
 * ChatWindow - Main chat interface
 * Features:
 * - Flexible layout with header, messages, and input
 * - FAB positioned dynamically above input area
 * - Mobile-responsive with full-height support
 */
const ChatWindow = ({ backendUrl, clientId, onClose, isMobile }) => {
  const { sendMessage, sendTyping } = useChatSocket(backendUrl, clientId);
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessageStatus = useChatStore((state) => state.updateMessageStatus);
  const updateMessageAttachment = useChatStore((state) => state.updateMessageAttachment);
  const removeMessage = useChatStore((state) => state.removeMessage);
  const isChatClosed = useChatStore((state) => state.isChatClosed);
  const rateLimitError = useChatStore((state) => state.rateLimitError);
  const clearRateLimitError = useChatStore((state) => state.clearRateLimitError);

  // Location Picker State
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showError = useCallback((message, id = null, duration = 3000) => {
    const toastId = id || `error-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    setToasts((prev) => {
      // Deduplicate by ID: If exists, don't add new one (maintain existing)
      if (prev.some((t) => t.id === toastId)) return prev;

      const newToast = { id: toastId, message, type: 'error', duration };
      const updated = [...prev, newToast];

      // Limit to 3 (keep latest 3)
      if (updated.length > 3) {
        return updated.slice(updated.length - 3);
      }
      return updated;
    });
  }, []);

  // React to rate limit errors from store (socket-based rate limiting)
  useEffect(() => {
    if (rateLimitError) {
      const { message, retryAfter } = rateLimitError;
      showError(
        `${message} (${retryAfter} detik)`,
        'rate-limit', // Unique ID: only one rate-limit toast at a time
        5000, // Longer duration for rate limit feedback
      );
      clearRateLimitError();
    }
  }, [rateLimitError, showError, clearRateLimitError]);

  const handleLocationPickerOpen = useCallback(() => {
    setShowLocationPicker(true);
  }, []);

  // Track input area height for FAB positioning
  const [inputHeight, setInputHeight] = useState(70);

  // Scroll state from MessageList
  const [scrollState, setScrollState] = useState({
    showFab: false,
    scrollToBottom: () => {},
    unreadCount: 0,
  });

  const handleScrollStateChange = useCallback((state) => {
    setScrollState(state);
  }, []);

  const handleInputHeightChange = useCallback((height) => {
    setInputHeight(height);
  }, []);

  // We use ref to InputArea to get message when needed and clear input
  const inputAreaRef = useRef(null);

  // --- Attachments Logic Hook ---
  const {
    previewAttachments,
    setPreviewAttachments,
    handleAttachment,
    handleAddFiles,
    handlePreviewSend,
  } = useChatAttachments({
    backendUrl,
    clientId,
    sendMessage,
    addMessage,
    updateMessageStatus,
    updateMessageAttachment,
    removeMessage,
    showError,
    inputAreaRef,
  });

  const { isDragging, dragHandlers } = useDragDrop((files) => handleAddFiles(files), showError);

  // Handle Paste Event
  useEffect(() => {
    const handlePaste = (e) => {
      if (!e.clipboardData || !e.clipboardData.files.length) return;
      // Only handle paste if NOT focusing an input that handles paste itself (optional, but good UX)
      // But here we want global paste behavior similar to AttachmentDialog
      e.preventDefault();

      const files = Array.from(e.clipboardData.files);
      handleAddFiles(files);
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleAddFiles]);

  return (
    <Card
      className={`relative flex h-full flex-col overflow-hidden border border-gray-200 bg-white shadow-2xl ${isMobile ? '' : 'rounded-xl'}`}
      {...dragHandlers}
    >
      <Header onClose={onClose} isMobile={isMobile} />

      <MessageList onScrollStateChange={handleScrollStateChange} backendUrl={backendUrl} clientId={clientId} />

      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="fade-in zoom-in-95 pointer-events-none absolute inset-0 z-[60] m-4 flex animate-in items-center justify-center rounded-xl border-2 border-primary-500 border-dashed bg-white/90 backdrop-blur-sm duration-200">
          <div className="flex flex-col items-center justify-center text-primary-600">
            <div className="mb-4 rounded-full bg-primary-50 p-4">
              <CloudUpload className="h-12 w-12" />
            </div>
            <h3 className="font-semibold text-xl">Drop files here</h3>
          </div>
        </div>
      )}

      {/* FAB positioned dynamically above InputArea */}
      {scrollState.showFab && (
        <div
          className="pointer-events-none absolute right-0 left-0 z-20"
          style={{ bottom: `${inputHeight + 32}px` }}
        >
          <ScrollToBottomFAB
            onClick={scrollState.scrollToBottom}
            unreadCount={scrollState.unreadCount}
          />
        </div>
      )}

      {/* Attachment Preview Modal */}
      {previewAttachments.length > 0 && (
        <AttachmentPreviewDialog
          attachments={previewAttachments}
          onClose={(currentAttachments) => {
            // Reverse Sync (Close): Check first attachment for caption
            if (currentAttachments && currentAttachments.length > 0) {
              const firstAtt = currentAttachments[0];
              if (firstAtt.caption?.trim()) {
                inputAreaRef.current?.setMessage(firstAtt.caption);
              }
            }
            setPreviewAttachments([]);
          }}
          onSend={handlePreviewSend}
          onAddAttachment={(newAtts) => setPreviewAttachments((prev) => [...prev, ...newAtts])}
          onRemoveAttachment={(id) => {
            setPreviewAttachments((prev) => {
              const removed = prev.find((a) => a.id === id);
              // Reverse Sync (Remove): If removed item had caption, move to input
              if (removed?.caption?.trim()) {
                inputAreaRef.current?.setMessage(removed.caption);
              }
              return prev.filter((a) => a.id !== id);
            });
          }}
          onUpdateAttachment={(id, updates) =>
            setPreviewAttachments((prev) =>
              prev.map((a) => (a.id === id ? { ...a, ...updates } : a)),
            )
          }
          onError={showError}
        />
      )}

      {/* Toast Notifications Container */}
      <div className="pointer-events-none absolute right-4 bottom-20 left-4 z-[100] flex flex-col gap-2">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <div key={toast.id} className="pointer-events-auto">
              <Toast
                message={toast.message}
                type={toast.type}
                duration={toast.duration}
                onClose={() => removeToast(toast.id)}
              />
            </div>
          ))}
        </AnimatePresence>
      </div>

      {isChatClosed ? (
        <div className="flex flex-col items-center gap-3 border-gray-100 border-t bg-gray-50 p-4">
          <p className="font-medium text-gray-500 text-sm">Sesi chat ini telah berakhir.</p>
          <Button
            onClick={() => {
              useChatStore.getState().reset();
              // Prevent the widget from closing (reset sets isOpen to false)
              useChatStore.setState({ isOpen: true, view: 'prechat' });
            }}
            className="w-full bg-blue-600 text-white hover:bg-blue-700"
          >
            Mulai Chat Baru
          </Button>
        </div>
      ) : (
        <InputArea
          ref={inputAreaRef}
          onSend={sendMessage}
          onTyping={sendTyping}
          onAttachment={handleAttachment}
          onHeightChange={handleInputHeightChange}
          isMobile={isMobile}
          onLocationPickerOpen={handleLocationPickerOpen}
          onError={showError}
        />
      )}

      {/* Location Picker Overlay */}
      {showLocationPicker && (
        <LocationPicker
          onSendLocation={(locationData) => {
            // Format: "Lat: -6.2, Lng: 106.8" or Google Maps URL
            const mapUrl = `https://www.google.com/maps?q=${locationData.latitude},${locationData.longitude}`;
            // Send as a location type message
            sendMessage(
              mapUrl,
              'location',
              [], // No attachments
              {
                latitude: locationData.latitude,
                longitude: locationData.longitude,
                address: locationData.address,
              },
            );
            setShowLocationPicker(false);
          }}
          onClose={() => setShowLocationPicker(false)}
        />
      )}
    </Card>
  );
};

export default ChatWindow;
