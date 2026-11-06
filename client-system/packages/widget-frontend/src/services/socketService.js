import { useChatStore } from '@stores/chatStore';
import { useThemeStore } from '@stores/themeStore';
import { AsyncQueuer, Debouncer } from '@tanstack/pacer';
import { io } from 'socket.io-client';
import { generateUUID } from '@/utils/uuid';

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.isSessionReady = false;
    this.readReceiptQueue = [];

    // TanStack Pacer: Queue for buffered events
    // Using AsyncQueuer for promise support and start/stop control
    this._eventQueue = new AsyncQueuer(
      async (task) => await task(), // Processor: executes the passed async function
      {
        concurrency: 1,
        started: false, // Start paused until connected
        onSuccess: () => {},
        onError: (_err) => {},
      },
    );

    // TanStack Pacer: Debounced Disconnect
    // Using Debouncer class for .cancel() and .maybeExecute() control
    this._disconnectDebounced = new Debouncer(
      () => {
        if (this.socket) {
          this.socket.removeAllListeners();

          // Only disconnect if fully connected to prevent reload warnings
          if (this.socket.connected) {
            this.socket.disconnect();
          }

          this.socket = null;
          this.isConnected = false;
          this._eventQueue.stop(); // Stop queue processing
        }
      },
      { wait: 300 },
    );

    // TanStack Pacer: Debounced Typing Stop
    this._stopTypingDebounced = new Debouncer(
      () => {
        this.emit('message:typing', { isTyping: false });
        this._isTypingActive = false;
      },
      { wait: 2000 },
    );

    // Initialize network listeners once
    this._setupNetworkListeners();
  }

  connect(backendUrl, clientId) {
    // Cancel any pending disconnect
    if (this._disconnectDebounced) {
      this._disconnectDebounced.cancel();
    }

    const store = useChatStore.getState();
    store.setConfigError(null); // Reset error on new connection attempt

    if (!clientId) {
      store.setConfigError({
        type: 'MISSING_CLIENT_ID',
        message: 'Client ID diperlukan untuk menginisialisasi widget.',
        context: {},
      });
      return;
    }

    // Guard: prevent re-connection if already connected or currently connecting with same config
    if (this.socket && this.backendUrl === backendUrl && this.clientId === clientId) {
      return;
    }

    // Cleanup existing socket if connecting to a new config
    if (this.socket) {
      this.disconnect();
    }

    this.backendUrl = backendUrl; // Store for REST calls
    this.clientId = clientId; // Store for reconnection

    // Extract origin to prevent Socket.IO from treating path as namespace
    let socketUrl = backendUrl;
    try {
      socketUrl = new URL(backendUrl).origin;
    } catch {
      /* ignore invalid URL */
    }

    this.socket = io(socketUrl, {
      path: import.meta.env.VITE_SOCKET_PATH || '/socket.io/', // Configurable Socket Path
      query: { clientId },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    this._setupEventHandlers();
    this._setupReconnectionHandlers();
  }

  _setupNetworkListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        // Give network stack a moment to stabilize
        setTimeout(() => {
          const isDisconnected = !this.socket || !this.socket.connected;

          if (isDisconnected) {
            if (this.socket) {
              this.socket.removeAllListeners();
              this.socket.disconnect();
              this.socket = null;
            }

            // Completely fresh connection initialization
            if (this.backendUrl && this.clientId) {
              this.connect(this.backendUrl, this.clientId);
            }
          }
        }, 1000);
      });
    }
  }

  _setupEventHandlers() {
    const store = useChatStore.getState();

    this.socket.on('config:loaded', ({ theme }) => {
      useThemeStore.getState().setTheme(theme);
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      store.setConnected(true);
      this._eventQueue.start();

      // Rejoin session if exists (for reconnection)
      const { sessionId } = useChatStore.getState();
      if (sessionId) {
        this.socket.emit('session:rejoin', { sessionId });
      } else {
        // If no session, we are ready to start new
        this.isSessionReady = true;
      }

      this._reconcilePendingMessages();
    });

    this.socket.on('disconnect', (_reason) => {
      this.isConnected = false;
      this.isSessionReady = false;
      store.setConnected(false);
      this._eventQueue.stop(); // Pause queue
    });

    this.socket.on('session:rejoined', async ({ success }) => {
      if (success) {
        this.isSessionReady = true;
        const { sessionId } = useChatStore.getState();
        await this._fetchHistory(sessionId); // Fetch history
        this._flushReadReceiptQueue();
      } else {
        this._handleSessionInvalid('session_not_found');
      }
    });

    // Handle session invalidation (expired or not found in database)
    this.socket.on('session:invalid', ({ reason }) => {
      this._handleSessionInvalid(reason);
    });

    this.socket.on('chat:started', (session) => {
      this.isSessionReady = true;
      store.setSession(session);
      store.setView('chat');
      this._flushReadReceiptQueue();
    });

    this.socket.on('message:receive', (message) => {
      const { isOpen } = useChatStore.getState();

      store.addMessage({
        ...message,
      });

      if (!isOpen) {
        store.incrementUnread();
      }
    });

    this.socket.on('message:ack', ({ messageId, status, error, retryAfter }) => {
      if (status === 'rate_limited') {
        store.updateMessageStatus(messageId, 'error');
        store.setRateLimitError({
          message: error || 'Pelan-pelan ya 😊 Tunggu sebentar sebelum mengirim lagi.',
          retryAfter: retryAfter || 10,
        });
        store.removePendingMessage(messageId);
        return;
      }

      store.updateMessageStatus(messageId, status);
      store.removePendingMessage(messageId);
    });

    this.socket.on('typing:agent', ({ isTyping, agentName, agentId, agentRole, isBot }) => {
      store.setAgentTyping({
        isTyping,
        agent: isTyping
          ? { name: agentName, id: agentId, role: agentRole, isBot: isBot || agentRole === 'bot' }
          : null,
      });
    });

    // Listen for message status updates (delivered, read)
    this.socket.on('message:status', ({ messageId, status }) => {
      store.updateMessageStatus(messageId, status);
    });

    // Listen for session confirmation from backend (with interactionId and bot/agent info)
    this.socket.on('session:updated', ({ interactionId, agentHandle, connectionType, botInfo }) => {
      // Use backend provided name or generic fallback
      const botName = botInfo?.name || 'Bot';

      store.setSession({
        ...useChatStore.getState(),
        interactionId,
        agentHandle,
        connectionType: connectionType || 'bot',
        agentInfo:
          connectionType === 'bot'
            ? { name: botName, isBot: true }
            : useChatStore.getState().agentInfo, // Preserve existing agent info
      });

      // System message (bot connected) is now stored in DB and fetched via history
      // No need to add duplicate here
    });

    // Listen for waiting in queue
    // Listen for waiting in queue
    this.socket.on('agent:waiting', ({ queuePosition: _queuePosition }) => {
      store.setConnectionType('waiting');

      // System message (agent requested) is now stored in DB and fetched via history
      // No need to add duplicate here
    });

    // Listen for agent assignment
    this.socket.on('agent:assigned', ({ agentId, agentName, agentRole }) => {
      store.setAgentInfo({
        name: agentName || agentId,
        handle: agentId,
        role: agentRole, // Store role
      });

      // System message (agent assigned) is now stored in DB and fetched via history
      // No need to add duplicate here
    });

    // Listen for chat closed
    this.socket.on('chat:closed', ({ interactionId: _interactionId, closedByName, closedRole }) => {
      store.setChatClosed(true, {
        name: closedByName || 'Agent',
        role: closedRole || 'agent',
        avatar: null, // Avatar can be fetched if needed, or use default
      });
      // Optionally add a system message locally if needed, but backend usually sends one via history/socket
    });

    // Socket errors are handled by connect_error; this prevents uncaught error events
    this.socket.on('error', () => {});

    this._setupConnectionErrorHandlers();
  }

  _setupConnectionErrorHandlers() {
    const store = useChatStore.getState();

    this.socket.on('connect_error', (err) => {
      let errorType = 'CONNECTION_ERROR';
      let errorMessage = err.message;
      let context = {};

      // Use structured error code from backend if available, fallback to message matching
      const errCode = err.data?.code;
      const errMsg = err.message || '';

      if (errCode === 'MISSING_CLIENT_ID' || errMsg.includes('Missing clientId')) {
        errorType = 'MISSING_CLIENT_ID';
        errorMessage = 'Client ID tidak ditemukan. Pastikan konfigurasi widget sudah benar.';
      } else if (errCode === 'MISSING_ORIGIN' || errMsg.includes('Origin header')) {
        errorType = 'MISSING_ORIGIN';
        errorMessage = 'Header Origin diperlukan untuk keamanan.';
      } else if (
        errCode === 'SERVICE_UNAVAILABLE' ||
        errMsg.includes('Validation service unavailable') ||
        errMsg.includes('Request failed') ||
        errMsg.includes('Validation failed')
      ) {
        // Catch internal platform errors before they are misclassified
        errorType = 'SERVICE_UNAVAILABLE';
        errorMessage = 'Layanan validasi sedang tidak tersedia, silakan coba lagi nanti.';
      } else if (
        errCode === 'INVALID_CLIENT_ID' ||
        errMsg.includes('Unauthorized') ||
        errMsg.includes('Invalid Client')
      ) {
        errorType = 'INVALID_CLIENT_ID';
        errorMessage = 'Client ID tidak valid atau tidak terdaftar.';
        context = { clientId: this.clientId };
      } else if (errCode === 'ORIGIN_NOT_ALLOWED' || errMsg.includes('Origin not allowed')) {
        errorType = 'ORIGIN_NOT_ALLOWED';
        errorMessage = 'Domain ini tidak diizinkan untuk menggunakan widget ini.';
        context = { origin: window.location.origin };
      } else if (errCode === 'CLIENT_INACTIVE' || errMsg.includes('inactive')) {
        errorType = 'CLIENT_INACTIVE';
        errorMessage = 'Widget client ini sedang dinonaktifkan.';
      }

      // If it's a configuration or auth error, set global config error
      if (errorType !== 'CONNECTION_ERROR') {
        store.setConfigError({
          type: errorType,
          message: errorMessage,
          context,
        });

        // Stop reconnection attempts for fatal config errors
        this.socket.close();
      }
    });
  }

  _setupReconnectionHandlers() {
    this.socket.on('reconnect_attempt', (attempt) => {
      this.reconnectAttempts = attempt;
    });

    this.socket.on('reconnect_failed', () => {});

    this.socket.on('reconnect', () => {
      const { sessionId } = useChatStore.getState();
      if (sessionId) {
        // Wait for rejoin ack
        this.isSessionReady = false;
        this.emit('session:rejoin', { sessionId });
      }
    });
  }

  emit(event, data) {
    if (this.isConnected && this.socket) {
      this.socket.emit(event, data);
    } else {
      this._eventQueue.addItem(() => {
        if (this.socket?.connected) {
          this.socket.emit(event, data);
          return Promise.resolve();
        }
        return Promise.reject('Socket not connected');
      });
    }
  }

  async _reconcilePendingMessages() {
    const store = useChatStore.getState();
    const pendingMessages = store.pendingMessages;

    if (pendingMessages.length === 0) return;

    // Get full message details from main store
    const fullMessages = store.messages.filter((m) => pendingMessages.some((pm) => pm.id === m.id));

    fullMessages.forEach((msg) => {
      this.socket.emit('message:send', {
        messageId: msg.id,
        content: msg.content,
        type: msg.type,
      });
    });
  }

  _flushReadReceiptQueue() {
    if (!this.readReceiptQueue.length) return;
    this.readReceiptQueue.forEach((messageId) => {
      this.emit('message:read', { messageId });
    });
    this.readReceiptQueue = [];
  }

  startChat(visitorInfo) {
    this.emit('chat:start', visitorInfo);
  }

  /**
   * Send a message via socket
   * @param {Object} message - Message object with content, type, attachments
   * @param {string} existingMessageId - Optional. If provided, skips addMessage (for optimistic UI flows)
   */
  sendMessage(message, existingMessageId = null) {
    // Stop typing indicator immediately when sending
    this.stopTyping();

    // Use existing ID if provided (e.g., from attachment upload flow), else generate new
    const messageId = existingMessageId || generateUUID();
    const store = useChatStore.getState();

    // Determine message type based on attachments
    const hasAttachments = message.attachments && message.attachments.length > 0;
    const messageType = hasAttachments
      ? message.attachments[0].fileType || message.attachments[0].type || 'file'
      : message.type || 'text';

    // Only add message to store if not using existing (optimistic) message
    if (!existingMessageId) {
      store.addMessage({
        ...message, // Now includes agentId, senderName from backend
        // sender is already present in message object from backend
        id: messageId,
        type: messageType,
        // direction removed
        sender: 'visitor', // Explicitly set sender for optimistic update
        status: 'pending',
        attachments: message.attachments || [],
        meta: message.metadata, // Pass metadata (e.g. location address)
      });
    }

    store.addPendingMessage({ id: messageId });

    this.emit('message:send', {
      messageId,
      content: message.content,
      type: messageType,
      attachments: message.attachments || [],
      meta: message.metadata, // Send metadata to backend
    });

    return messageId;
  }

  // Typing state tracking
  _isTypingActive = false;

  sendTyping(hasText) {
    if (!this.isSessionReady) return;

    // Clear pending stop (debounce handles this internally usually, but we call cancel)
    this._stopTypingDebounced.cancel();

    if (hasText) {
      // Emit "start" only once
      if (!this._isTypingActive) {
        this.emit('message:typing', { isTyping: true });
        this._isTypingActive = true;
      }
    }

    // Schedule stop if active
    if (this._isTypingActive) {
      this._stopTypingDebounced.maybeExecute();
    }
  }

  stopTyping() {
    this._stopTypingDebounced.cancel();
    if (this._isTypingActive && this.isSessionReady) {
      this.emit('message:typing', { isTyping: false });
      this._isTypingActive = false;
    }
  }

  sendReadReceipt(messageId) {
    const store = useChatStore.getState();
    const message = store.messages.find((m) => m.id === messageId);

    // If message is already read locally, don't send receipt
    if (message && message.status === 'read') return;

    if (this.isSessionReady) {
      this.emit('message:read', { messageId });

      // Optimistic Update
      store.updateMessageStatus(messageId, 'read');
    } else if (!this.readReceiptQueue.includes(messageId)) {
      this.readReceiptQueue.push(messageId);
    }
  }

  async _fetchHistory(sessionId) {
    const store = useChatStore.getState();

    try {
      const response = await fetch(`${this.backendUrl}/api/widget/history?sessionId=${sessionId}`, {
        headers: { 'X-Client-Id': this.clientId }
      });

      if (response.status === 429) {
        let retryAfter = 60;
        try {
          const errData = await response.json();
          if (errData?.error?.retryAfter) retryAfter = errData.error.retryAfter;
        } catch {
          /* ignore parse error */
        }

        store.setRateLimitError({
          message: 'Terlalu banyak permintaan. Silakan tunggu sebentar.',
          retryAfter,
        });
        return;
      }

      if (!response.ok) throw new Error('Failed to fetch history');

      const data = await response.json();

      if (data.messages && data.messages.length > 0) {
        const mappedMessages = data.messages.map((msg) => ({
          ...msg,
          // Ensure defaults for critical fields if missing
          status: msg.status || 'read',
          attachments: msg.attachments || [],
        }));

        store.mergeMessages(mappedMessages);

        // Calculate unread count from history (Single Source of Truth)
        const unreadCount = mappedMessages.filter(
          (m) => m.sender !== 'visitor' && m.status !== 'read',
        ).length;

        store.setUnreadCount(unreadCount);
      }
    } catch {
      // Network errors during history fetch are non-fatal; session continues
    }
  }

  /**
   * Handle invalid/expired session
   * Clears local state and returns user to prechat form
   */
  _handleSessionInvalid(_reason) {
    const store = useChatStore.getState();

    // Clear session data from store
    store.clearSession();
    store.clearMessages();

    // Reset to prechat view
    store.setView('prechat');

    // Clear internal state
    this.isSessionReady = false;
    this._eventQueue.clear(); // Clear Pacer Queue
    this.readReceiptQueue = [];
  }

  endChat(rating, feedback) {
    this.emit('chat:end', { rating, feedback });
    useChatStore.getState().setView('rating');
  }

  disconnect() {
    // Use Pacer Debounce
    this._disconnectDebounced.maybeExecute();
  }
}

export const socketService = new SocketService();
