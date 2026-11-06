import { socketService } from '@services/socketService';
import { useCallback } from 'react';

export function useChatSocket(_backendUrl, _clientId) {
  // Connection logic moved to ChatWidget.jsx
  // to ensure socket stays persistent across views

  const startChat = useCallback((visitorInfo) => {
    socketService.startChat(visitorInfo);
  }, []);

  /**
   * Send a message via socket
   * @param {string} content - Message text content
   * @param {string} type - Message type (text, image, video, audio, document)
   * @param {Array} attachments - Optional attachments array
   * @param {string} existingMessageId - Optional. If provided, skips addMessage (for optimistic UI)
   */
  const sendMessage = useCallback(
    (content, type = 'text', attachments = [], metadata = {}, existingMessageId = null) => {
      return socketService.sendMessage({ content, type, attachments, metadata }, existingMessageId);
    },
    [],
  );

  const sendTyping = useCallback((isTyping) => {
    socketService.sendTyping(isTyping);
  }, []);

  const endChat = useCallback((rating, feedback) => {
    socketService.endChat(rating, feedback);
  }, []);

  return {
    startChat,
    sendMessage,
    sendTyping,
    endChat,
    isConnected: socketService.isConnected,
  };
}
