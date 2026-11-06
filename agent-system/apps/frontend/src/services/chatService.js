import api from '@/lib/axios';

export const chatService = {
    /**
     * Fetch all active chats (interactions)
     */
    getChats: async () => {
        try {
            const response = await api.get('/chat');
            return response.data; // { chats: [...] }
        } catch (error) {
            console.error('Error fetching chats:', error);
            throw error;
        }
    },

    /**
     * Fetch message history for an interaction
     */
    getMessages: async (interactionId) => {
        try {
            const response = await api.get(`/chat/${interactionId}/messages`);
            return response.data;
        } catch (error) {
            console.error('Error fetching messages:', error);
            throw error;
        }
    },

    /**
     * Send a message as an agent
     * @param {string} tempId - Frontend-generated temporary ID for correlation
     * @param {Array} attachments - Optional array of attachments
     */
    sendMessage: async (interactionId, content, agentId, agentName, role, tempId, attachments = []) => {
        try {
            const response = await api.post(`/chat/${interactionId}/messages`, {
                content,
                type: attachments.length > 0 ? attachments[0].fileType : 'text',
                agentId,
                agentName,
                role,
                tempId, // For correlating response with optimistic update
                attachments
            });
            return response.data; // { success: true, messageId }
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    },

    /**
     * Handle a chat (Take ownership)
     */
    handleChat: async (interactionId, agentId, agentName) => {
        try {
            const response = await api.post(`/chat/${interactionId}/handle`, {
                agentId,
                agentName
            });
            return response.data;
        } catch (error) {
            console.error('Error handling chat:', error);
            throw error;
        }
    },

    /**
     * Close a chat
     */
    closeChat: async (interactionId, agentId) => {
        try {
            const response = await api.post(`/chat/${interactionId}/close`, {
                agentId
            });
            return response.data;
        } catch (error) {
            console.error('Error closing chat:', error);
            throw error;
        }
    },

    /**
     * Transfer a chat
     */
    transferChat: async (interactionId, agentId, agentName, targetAgentId, targetAgentName) => {
        try {
            const response = await api.post(`/chat/${interactionId}/transfer`, {
                agentId,
                agentName,
                targetAgentId,
                targetAgentName
            });
            return response.data;
        } catch (error) {
            console.error('Error transferring chat:', error);
            throw error;
        }
    },

    /**
     * Get available agents for transfer
     */
    getAgents: async () => {
        try {
            const response = await api.get('/auth/agents');
            return response.data;
        } catch (error) {
            console.error('Error fetching agents:', error);
            throw error;
        }
    }
};
