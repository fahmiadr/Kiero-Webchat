import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { IS_PREVIEW } from '@/utils/previewMode';
import { generateUUID } from '@/utils/uuid';

const createUISlice = (set, get) => ({
  isOpen: false,
  view: 'minimized',
  unreadCount: 0,

  openWidget: () => {
    const { sessionId, view } = get();
    // If we have a session, go straight to chat. Otherwise prechat.
    // Also keep existing view if we are already in 'chat' or 'rating'
    let targetView = 'prechat';
    if (sessionId) {
      targetView = view === 'minimized' ? 'chat' : view;
    }

    set({
      isOpen: true,
      view: targetView,
      unreadCount: 0, // Reset unread when opening
    });
  },
  closeWidget: () =>
    set((state) => {
      state.isOpen = false;
    }),
  setView: (view) =>
    set((state) => {
      state.view = view;
    }),
  incrementUnread: () =>
    set((state) => {
      state.unreadCount += 1;
    }),
  resetUnread: () =>
    set((state) => {
      state.unreadCount = 0;
    }),
  setUnreadCount: (count) =>
    set((state) => {
      state.unreadCount = count;
    }),
});

const createSessionSlice = (set) => ({
  sessionId: null,
  interactionId: null,
  visitorInfo: null,
  agentInfo: null,
  connectionType: 'bot', // 'bot' | 'agent' | 'waiting'

  setSession: (session) =>
    set({
      sessionId: session.sessionId,
      interactionId: session.interactionId,
      agentInfo: session.agentInfo,
      connectionType: session.connectionType || 'bot',
    }),

  setConnectionType: (type) => set({ connectionType: type }),

  setAgentInfo: (info) =>
    set({
      agentInfo: info,
      connectionType: 'agent',
    }),

  setVisitorInfo: (info) => set({ visitorInfo: info }),

  clearSession: () =>
    set({
      sessionId: null,
      interactionId: null,
      visitorInfo: null,
      agentInfo: null,
      connectionType: 'bot',
      isChatClosed: false,
      closedInfo: null, // Clear closed info
    }),

  setChatClosed: (isClosed, closedInfo = null) =>
    set({
      isChatClosed: isClosed,
      closedInfo: isClosed ? closedInfo : null,
    }),
});

const createMessagesSlice = (set) => ({
  messages: [],
  pendingMessages: [],

  addMessage: (message) =>
    set((state) => {
      // ATOMIC SYNC: Instantly clear typing indicator when an agent/bot message arrives
      // This guarantees the layout height doesn't thrash if the webhook was delayed!
      if (message.sender !== 'visitor') {
        if (state.typingTimeout) {
          clearTimeout(state.typingTimeout);
          state.typingTimeout = null;
        }
        state.isAgentTyping = false;
      }

      const msgId = message.id || generateUUID();
      const existingIndex = state.messages.findIndex((m) => m.id === msgId);

      if (existingIndex !== -1) {
        // Update existing message
        state.messages[existingIndex] = {
          ...state.messages[existingIndex],
          ...message,
        };
      } else {
        // Add new message
        state.messages.push({
          ...message,
          id: msgId,
          timestamp: message.timestamp || new Date().toISOString(),
          status: message.status || 'sent',
        });
      }
    }),

  updateMessageStatus: (messageId, status) =>
    set((state) => {
      const priority = {
        pending: 0,
        failed: 0, // Failed can be retried/overwritten
        sent: 1,
        delivered: 2,
        read: 3,
      };

      return {
        messages: state.messages.map((msg) => {
          if (msg.id !== messageId) return msg;

          const currentPriority = priority[msg.status] || 0;
          const newPriority = priority[status] || 0;

          // Always allow 'failed' status to be set if not already read
          if (status === 'failed' && msg.status !== 'read') {
            return { ...msg, status };
          }

          // Only update if new status has higher or equal priority
          // Equal priority is needed for same-status updates (like initially setting to sent)
          if (newPriority >= currentPriority) {
            return { ...msg, status };
          }

          return msg;
        }),
      };
    }),

  // Update specific attachment within a message (for optimistic upload tracking)
  updateMessageAttachment: (messageId, attachmentIndex, updates) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              attachments: msg.attachments?.map((att, i) =>
                i === attachmentIndex ? { ...att, ...updates } : att,
              ),
            }
          : msg,
      ),
    })),

  addPendingMessage: (message) =>
    set((state) => ({
      pendingMessages: [...state.pendingMessages, message],
    })),

  mergeMessages: (newMessages) =>
    set((state) => {
      const existingIds = new Set(state.messages.map((m) => m.id));
      const uniqueMessages = newMessages.filter((m) => !existingIds.has(m.id));

      if (uniqueMessages.length === 0) return state;

      // Combine and sort by timestamp
      const combined = [...state.messages, ...uniqueMessages].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
      );

      return { messages: combined };
    }),

  removePendingMessage: (messageId) =>
    set((state) => ({
      pendingMessages: state.pendingMessages.filter((m) => m.id !== messageId),
    })),

  removeMessage: (messageId) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId),
    })),

  clearMessages: () => set({ messages: [], pendingMessages: [] }),
});

const createTypingSlice = (set, get) => ({
  isAgentTyping: false,
  typingAgent: null, // { name, role, id }
  isVisitorTyping: false,
  typingTimeout: null, // Debounce timer for robust typing layout transitions
  isConnected: false,
  rateLimitError: null, // { message, retryAfter, timestamp }
  configError: null, // { type, message, context }
  runtimeError: null, // React Error Boundary caught error

  setAgentTyping: ({ isTyping, agent }) => {
    const state = get();
    if (isTyping) {
      if (state.typingTimeout) clearTimeout(state.typingTimeout);
      set({
        isAgentTyping: true,
        typingAgent: agent || state.typingAgent,
        typingTimeout: null,
      });
    } else if (state.isAgentTyping) {
      // 1.5s Grace Period: prevents layout jumping if a message is arriving a few ms later!
      if (state.typingTimeout) clearTimeout(state.typingTimeout);
      const timeout = setTimeout(() => {
        set({ isAgentTyping: false, typingAgent: null, typingTimeout: null });
      }, 1500);
      set({ typingTimeout: timeout });
    }
  },
  setVisitorTyping: (isTyping) => set({ isVisitorTyping: isTyping }),
  setConnected: (isConnected) => set({ isConnected }),
  setRateLimitError: ({ message, retryAfter }) =>
    set({
      rateLimitError: { message, retryAfter, timestamp: Date.now() },
    }),
  clearRateLimitError: () => set({ rateLimitError: null }),
  setConfigError: (error) => set({ configError: error }),
  setRuntimeError: (error) => set({ runtimeError: error }),
});

export const useChatStore = create(
  devtools(
    persist(
      immer((set, get) => ({
        ...createUISlice(set, get),
        ...createSessionSlice(set),
        ...createMessagesSlice(set, get),
        ...createTypingSlice(set, get),

        reset: () => {
          set({
            isOpen: false,
            view: 'minimized',
            unreadCount: 0,
            sessionId: null,
            interactionId: null,
            visitorInfo: null,
            agentInfo: null,
            connectionType: 'bot',
            messages: [],
            pendingMessages: [],
            isAgentTyping: false,
            typingAgent: null,
            typingTimeout: null,
            isVisitorTyping: false,
            isChatClosed: false, // Reset closed state
          });
        },
      })),
      {
        name: IS_PREVIEW ? 'lc-chat-preview-storage' : 'lc-chat-storage',
        partialize: (state) => ({
          sessionId: state.sessionId,
          interactionId: state.interactionId,
          visitorInfo: state.visitorInfo,
          agentInfo: state.agentInfo,
          connectionType: state.connectionType,
          isChatClosed: state.isChatClosed, // Persist closed state
        }),
      },
    ),
    { name: 'ChatStore' },
  ),
);

export const useIsChatClosed = () => useChatStore((state) => state.isChatClosed);

export const useIsOpen = () => useChatStore((state) => state.isOpen);
export const useView = () => useChatStore((state) => state.view);
export const useMessages = () => useChatStore((state) => state.messages);
export const useUnreadCount = () => useChatStore((state) => state.unreadCount);
export const useIsAgentTyping = () => useChatStore((state) => state.isAgentTyping);
export const useTypingAgent = () => useChatStore((state) => state.typingAgent);
export const useIsConnected = () => useChatStore((state) => state.isConnected);
export const useAgentInfo = () => useChatStore((state) => state.agentInfo);
export const useRuntimeError = () => useChatStore((state) => state.runtimeError);
