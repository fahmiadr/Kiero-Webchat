import { socketService } from '@services/socketService';
import {
  useAgentInfo,
  useChatStore,
  useIsAgentTyping,
  useIsOpen,
  useMessages,
  useTypingAgent,
} from '@stores/chatStore';
import { Debouncer, Throttler } from '@tanstack/pacer'; // Import Debouncer and Throttler
import { MessageSquare } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDateLabel } from '@/utils/formatUtils';
import DateSeparator from './DateSeparator';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';

/**
 * MessageList - Scrollable message container
 * Features:
 * - Auto-scroll to latest message (only if already at bottom)
 * - Read receipts on visible (Intersection Observer)
 * - Exposes scroll state via onScrollStateChange prop
 */
const MessageList = memo(({ onScrollStateChange, backendUrl, clientId }) => {
  const messages = useMessages();
  const isOpen = useIsOpen();
  const isAgentTyping = useIsAgentTyping();
  const typingAgent = useTypingAgent();
  const agentInfo = useAgentInfo();
  const containerRef = useRef(null);
  const observerRef = useRef(null);
  const bottomRef = useRef(null);
  const sentReadReceipts = useRef(new Set());
  const hasInitialScrolled = useRef(false);

  // Track scroll state
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false); // For Sticky Headers

  // Use ref to access isAtBottom inside interactions without triggering effects
  const isAtBottomRef = useRef(isAtBottom);
  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  // Calculate unread count (incoming messages not marked as read)
  useEffect(() => {
    const unread = messages.filter(
      (msg) =>
        msg.sender !== 'visitor' && // Incoming
        msg.status !== 'read' &&
        !sentReadReceipts.current.has(msg.id),
    ).length;
    setUnreadCount(unread);
  }, [messages]);

  // Initialize Debouncers and Throttlers for scroll handling
  // We use Refs to store the instances to persist across renders
  const scrollEndDebouncer = useRef(null);
  const autoScrollReleaseDebouncer = useRef(null);
  const manualScrollReleaseDebouncer = useRef(null);
  const scrollThrottler = useRef(null);

  useEffect(() => {
    // Initialize debouncers
    scrollEndDebouncer.current = new Debouncer(
      () => {
        setIsScrolling(false);
      },
      { wait: 1500 },
    ); // Match agent system debounce for smooth sticky header

    autoScrollReleaseDebouncer.current = new Debouncer(
      () => {
        setIsAutoScrolling(false);
      },
      { wait: 700 },
    );

    manualScrollReleaseDebouncer.current = new Debouncer(
      () => {
        setIsAutoScrolling(false);
      },
      { wait: 1000 },
    );

    // Initialize Throttler for scroll events
    // Wait 50ms (approx 20fps) to reduce layout thrashing while keeping UI responsive
    scrollThrottler.current = new Throttler(
      (scrollTop, scrollHeight, clientHeight) => {
        // Use a slightly larger threshold (50px) to be forgiving
        const atBottom = scrollHeight - scrollTop - clientHeight < 50;
        setIsAtBottom(atBottom);

        if (atBottom && isOpen) {
          setUnreadCount(0);
        }

        // Detect scrolling activity for Sticky Headers
        setIsScrolling(true);

        // Debounce the setting of IsScrolling to false
        scrollEndDebouncer.current?.maybeExecute();
      },
      { wait: 50 },
    );

    return () => {
      // Cleanup on unmount
      scrollEndDebouncer.current?.cancel();
      autoScrollReleaseDebouncer.current?.cancel();
      manualScrollReleaseDebouncer.current?.cancel();
      scrollThrottler.current?.cancel();
    };
  }, [isOpen]);

  // Handle scroll position detection & "Is Scrolling" state
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Pass values to throttler to avoid reading DOM inside throttled function if possible,
      // though here we read them synchronously to ensure accuracy for the throttled execution.
      scrollThrottler.current?.maybeExecute(scrollTop, scrollHeight, clientHeight);
    }
  }, []);

  // Handle manual user interaction (wheel/touch)
  // This immediately cancels "auto-scrolling" mode to make FAB responsive
  const handleUserInteraction = useCallback(() => {
    setIsAutoScrolling(false);
    // Also cancel any pending auto-scroll release to avoid state conflict
    autoScrollReleaseDebouncer.current?.cancel();
    manualScrollReleaseDebouncer.current?.cancel();
  }, []);

  // Attach scroll and interaction listeners
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
      container.addEventListener('wheel', handleUserInteraction, { passive: true });
      container.addEventListener('touchmove', handleUserInteraction, { passive: true });

      return () => {
        container.removeEventListener('scroll', handleScroll);
        container.removeEventListener('wheel', handleUserInteraction);
        container.removeEventListener('touchmove', handleUserInteraction);
      };
    }
  }, [handleScroll, handleUserInteraction]);

  // Auto-scroll logic with "Masking" to prevent FAB flicker
  // ONLY triggers on new messages or typing - NOT on manual scroll
  useEffect(() => {
    // Only run if messages exist
    if (messages.length === 0 && !isAgentTyping) return;

    const bottomElement = bottomRef.current;
    if (!bottomElement) return;

    // INITIAL SCROLL: Immediate jump (no animation)
    if (!hasInitialScrolled.current) {
      // Find first unread message
      const firstUnread = messages.find(
        (msg) =>
          msg.sender !== 'visitor' &&
          msg.status !== 'read' &&
          !sentReadReceipts.current.has(msg.id),
      );

      if (firstUnread) {
        // Wait for DOM to be ready
        requestAnimationFrame(() => {
          const el = containerRef.current?.querySelector(`[data-msg-id="${firstUnread.id}"]`);
          if (el) {
            el.scrollIntoView({ behavior: 'auto', block: 'center' }); // Jump to unread
          } else {
            bottomElement.scrollIntoView({ behavior: 'auto' }); // Fallback
          }
        });
      } else {
        bottomElement.scrollIntoView({ behavior: 'auto' }); // Jump to bottom
      }

      hasInitialScrolled.current = true;
      return;
    }

    // SUBSEQUENT SCROLL: Smooth scroll if already at bottom
    if (isAtBottomRef.current) {
      // Set masking state
      setIsAutoScrolling(true);
      bottomElement.scrollIntoView({ behavior: 'smooth' });

      // Remove mask after animation duration
      autoScrollReleaseDebouncer.current?.maybeExecute();
    }
  }, [messages, isAgentTyping]);

  // Notify parent of scroll state changes
  useEffect(() => {
    // If we are at bottom, any "unread" messages are visible, so effective count is 0
    // BUT only if the widget is actually open!
    const effectiveUnreadCount = isAtBottom && isOpen ? 0 : unreadCount;

    // Show FAB if:
    // 1. Not at bottom OR has unread messages
    // 2. AND we are NOT currently auto-scrolling (prevents flicker during animation)
    const showFab = (!isAtBottom || effectiveUnreadCount > 0) && !isAutoScrolling;

    const scrollToBottom = () => {
      setIsAutoScrolling(true); // Mask manual scroll-to-bottom too
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });

      if (isOpen) {
        setUnreadCount(0);
      }

      // Shorter timeout for manual scroll since we clear unread immediately
      manualScrollReleaseDebouncer.current?.maybeExecute();
    };

    onScrollStateChange?.({ showFab, scrollToBottom, unreadCount: effectiveUnreadCount });
  }, [isAtBottom, isAutoScrolling, unreadCount, onScrollStateChange, isOpen]);

  // SYNC: Keep global store unread count in sync with local count while widget is open
  // This ensures that if the user minimizes the widget while scrolled up, the button shows the correct count
  const setGlobalUnreadCount = useChatStore((state) => state.setUnreadCount);

  useEffect(() => {
    // Only sync if widget is open (processed by local logic)
    // If widget is closed, socket events handle the global count increment
    if (isOpen) {
      const effectiveUnreadCount = isAtBottom && isOpen ? 0 : unreadCount;
      setGlobalUnreadCount(effectiveUnreadCount);
    }
  }, [unreadCount, isOpen, isAtBottom, setGlobalUnreadCount]);

  // Setup Intersection Observer for "read when visible"

  // Let's use a ref for isOpen to access it inside the observer callback
  const isOpenRef = useRef(isOpen);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Guard: If widget is closed, ignore all intersections
        if (!isOpenRef.current) return;

        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const msgId = entry.target.getAttribute('data-msg-id');
            const sender = entry.target.getAttribute('data-sender');

            if (
              sender !== 'visitor' && // Incoming
              msgId &&
              !sentReadReceipts.current.has(msgId)
            ) {
              socketService.sendReadReceipt(msgId);
              sentReadReceipts.current.add(msgId);
            }
          }
        });
      },
      {
        root: containerRef.current,
        threshold: 0.1, // Reduced from 0.5 to catch fast scrolling
      },
    );

    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  // Batch mark messages as read when at bottom
  // This catches potentially skipped messages during fast auto-scrolling
  useEffect(() => {
    if (isAtBottom && isOpen) {
      const unreadMessages = messages.filter(
        (msg) =>
          msg.sender !== 'visitor' &&
          msg.status !== 'read' &&
          !sentReadReceipts.current.has(msg.id),
      );

      if (unreadMessages.length > 0) {
        unreadMessages.forEach((msg) => {
          socketService.sendReadReceipt(msg.id);
          sentReadReceipts.current.add(msg.id);
        });
      }
    }
  }, [isAtBottom, messages, isOpen]);

  // Group messages by date label for sticky section headers
  const groupedMessages = useMemo(() => {
    const groups = {};
    messages.forEach((msg) => {
      const dateLabel = formatDateLabel(msg.timestamp || msg.createdAt);
      if (!groups[dateLabel]) {
        groups[dateLabel] = [];
      }
      groups[dateLabel].push(msg);
    });
    return groups;
  }, [messages]);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-y-auto bg-gray-50/50 p-4"
      style={{ scrollbarWidth: 'thin', scrollbarColor: '#CBD5E1 transparent' }}
    >
      {messages.length === 0 && !isAgentTyping ? (
        <div
          className="flex h-full animate-fade-in flex-col items-center justify-center text-gray-400 opacity-0"
          style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-50">
            <MessageSquare className="h-6 w-6 text-gray-300" />
          </div>
          <p className="select-none text-sm">Belum ada pesan</p>
        </div>
      ) : (
        <>
          {Object.entries(groupedMessages).map(([dateLabel, groupMessages]) => (
            <div key={dateLabel} className="relative">
              <DateSeparator label={dateLabel} visible={isScrolling} root={containerRef.current} />

              <div className="flex flex-col">
                {groupMessages.map((msg, index) => {
                  // Calculate first/last in group relative to THIS date group
                  // This ensures bubbles reset style (rounded corners) at start of new day
                  const prevMsg = groupMessages[index - 1];
                  const nextMsg = groupMessages[index + 1];

                  const isDifferentSender = !prevMsg || prevMsg.sender !== msg.sender;
                  const isDifferentAgent = !prevMsg || prevMsg.agentId !== msg.agentId;

                  const isFirstInGroup =
                    isDifferentSender || (msg.sender === 'agent' && isDifferentAgent);

                  const isNextDifferentSender = !nextMsg || nextMsg.sender !== msg.sender;
                  const isNextDifferentAgent = !nextMsg || nextMsg.agentId !== msg.agentId;
                  const isLastInGroup =
                    isNextDifferentSender || (msg.sender === 'agent' && isNextDifferentAgent);

                  // Show avatar only for incoming messages at the start of a group
                  const showAvatar = msg.sender !== 'visitor' && isFirstInGroup;

                  // Determine sender name
                  let senderName = msg.senderName || 'Bot';
                  if (msg.sender === 'agent') {
                    senderName = msg.senderName || msg.agentName || 'Agent';
                  } else if (msg.sender === 'visitor') {
                    senderName = 'You';
                  }

                  const agentId = msg.sender === 'agent' ? msg.agentId : null;

                  return (
                    <div
                      key={msg.id}
                      data-msg-id={msg.id}
                      data-sender={msg.sender}
                      className="w-full"
                      ref={(el) => {
                        if (el && observerRef.current) {
                          observerRef.current.observe(el);
                        }
                      }}
                    >
                      <MessageBubble
                        message={{
                          ...msg,
                          attachments:
                            msg.attachments ||
                            (msg.attachmentUrl
                              ? [
                                  {
                                    url: msg.attachmentUrl,
                                    type: ['image', 'video', 'file', 'audio'].includes(msg.type)
                                      ? msg.type
                                      : 'file',
                                    name: 'Attachment',
                                  },
                                ]
                              : []),
                        }}
                        isFirstInGroup={isFirstInGroup}
                        isLastInGroup={isLastInGroup}
                        showAvatar={showAvatar}
                        senderName={senderName}
                        agentId={agentId}
                        backendUrl={backendUrl}
                        clientId={clientId}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {isAgentTyping && (
            <TypingIndicator
              agentName={typingAgent?.name || agentInfo?.name || 'Agent'}
              agentRole={
                typingAgent?.role ||
                agentInfo?.role ||
                (typingAgent?.isBot || (agentInfo?.isBot && !typingAgent) ? 'Bot' : null)
              }
              isBot={typingAgent?.isBot || (agentInfo?.isBot && !typingAgent)}
              agentId={typingAgent?.id || agentInfo?.id}
            />
          )}
          <div ref={bottomRef} />
        </>
      )}
    </div>
  );
});

export default MessageList;
