import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chatService } from '@/services/chatService';
import { socket } from '@/lib/socket';
import { useEffect } from 'react';
import useAuthStore from '@/stores/useAuthStore';

// GLOBAL LISTENER: Syncs messages for ALL chats (active or background)
export const useGlobalMessageListener = () => {
    const queryClient = useQueryClient();
    const user = useAuthStore(state => state.user);

    useEffect(() => {
        if (!user) return;

        const handleNewMessage = (message) => {
            console.log('[GlobalListener] Received message:', message); // DEBUG LOG
            const chatId = message.interactionId;
            if (!chatId) {
                console.error('[GlobalListener] Missing interactionId in message:', message);
                return;
            }

            // Update specific chat's message cache (whether active or not)
            queryClient.setQueryData(['messages', chatId], (oldData) => {
                console.log('[GlobalListener] Updating cache for:', chatId, 'OldData:', oldData); // DEBUG LOG

                if (!oldData || !oldData.messages) {
                    // If no cache, we might want to invalidate to ensure fresh fetch when opened
                    // But usually fetching on mount handles it.
                    return oldData;
                }

                const exists = oldData.messages.some(m => m.id === message.id);
                if (exists) return oldData;

                return {
                    ...oldData,
                    messages: [...oldData.messages, message]
                };
            });

            // Update unread count in chat list using authoritative value from backend
            if (typeof message.unreadCount === 'number') {
                queryClient.setQueryData(['chats'], (oldData) => {
                    if (!oldData || !oldData.chats) return oldData;

                    return {
                        ...oldData,
                        chats: oldData.chats.map(chat =>
                            chat.id === chatId
                                ? { ...chat, unread: message.unreadCount }
                                : chat
                        )
                    };
                });
            }
        };

        socket.on('message:receive', handleNewMessage);

        // Listen for message status updates (sent, delivered, read)
        const handleStatusUpdate = ({ interactionId, messageId, tempId, status }) => {
            console.log('[GlobalListener] Status update:', { interactionId, messageId, tempId, status });

            queryClient.setQueryData(['messages', interactionId], (oldData) => {
                if (!oldData || !oldData.messages) return oldData;

                return {
                    ...oldData,
                    messages: oldData.messages.map(msg => {
                        // Match by temp ID (for sent status) or by real message ID
                        if ((tempId && msg.id === tempId) || msg.id === messageId) {
                            return {
                                ...msg,
                                id: messageId || msg.id, // Replace temp ID with real ID
                                status
                            };
                        }
                        return msg;
                    })
                };
            });
        };

        socket.on('message:status', handleStatusUpdate);

        // Listen for messages marked as read (by this or other agents)
        const handleMessagesMarkedRead = ({ interactionId, messageIds }) => {
            console.log('[GlobalListener] Messages marked read:', { interactionId, messageIds });

            queryClient.setQueryData(['messages', interactionId], (oldData) => {
                if (!oldData || !oldData.messages) return oldData;

                return {
                    ...oldData,
                    messages: oldData.messages.map(msg =>
                        messageIds.includes(msg.id)
                            ? { ...msg, status: 'read' }
                            : msg
                    )
                };
            });

            // Also update unread count in chat list
            queryClient.setQueryData(['chats'], (oldData) => {
                if (!oldData || !oldData.chats) return oldData;

                return {
                    ...oldData,
                    chats: oldData.chats.map(chat =>
                        chat.id === interactionId
                            ? { ...chat, unread: Math.max(0, (chat.unread || 0) - messageIds.length) }
                            : chat
                    )
                };
            });
        };

        socket.on('messages:marked_read', handleMessagesMarkedRead);

        return () => {
            socket.off('message:receive', handleNewMessage);
            socket.off('message:status', handleStatusUpdate);
            socket.off('messages:marked_read', handleMessagesMarkedRead);
        };
    }, [queryClient, user]);
};

// Fetch all active chats
export const useActiveChats = () => {
    const queryClient = useQueryClient();

    // Listen for new chat sessions or status updates
    useEffect(() => {
        const handleUpdate = (data) => {
            // Optimistic Update: If we have the full chat object, add it directly to cache
            if (data?.type === 'new_chat' && data?.chat) {
                queryClient.setQueryData(['chats'], (oldData) => {
                    if (!oldData || !oldData.chats) return oldData;

                    // Avoid duplicates
                    if (oldData.chats.some(c => c.id === data.chat.id)) return oldData;

                    return {
                        ...oldData,
                        chats: [data.chat, ...oldData.chats]
                    };
                });
            } else if (data?.type === 'new_message') {
                // Ignore new_message events for list updates - handled by global listener
                return;
            } else {
                // Fallback for other updates or missing payload
                queryClient.invalidateQueries({ queryKey: ['chats'] });
            }

            // If new chat created, join its room immediately
            if (data?.type === 'new_chat' && data?.interactionId) {
                socket.emit('join_room', data.interactionId);
            }
        };

        const handleViewersUpdate = ({ interactionId, viewers }) => {
            queryClient.setQueryData(['chats'], (oldData) => {
                if (!oldData || !oldData.chats) return oldData;

                return {
                    ...oldData,
                    chats: oldData.chats.map(chat =>
                        chat.id === interactionId
                            ? { ...chat, viewers }
                            : chat
                    )
                };
            });
        };

        socket.on('interaction:update', handleUpdate);
        socket.on('chat:viewers_update', handleViewersUpdate);

        return () => {
            socket.off('interaction:update', handleUpdate);
            socket.off('chat:viewers_update', handleViewersUpdate);
        };
    }, [queryClient]);

    const queryInfo = useQuery({
        queryKey: ['chats'],
        queryFn: chatService.getChats,
        select: (data) => data.chats || [],
    });

    // Validated Room Joining Logic: Run whenever chats list changes
    useEffect(() => {
        if (queryInfo.data && queryInfo.data.length > 0) {
            queryInfo.data.forEach(chat => {
                // Determine the correct ID field (backend uses interactionId, frontend service usually maps it to id)
                const roomId = chat.id;
                socket.emit('join_room', roomId);
            });
        }
    }, [queryInfo.data]);

    return queryInfo;
};

// Fetch messages for a specific chat
export const useChatMessages = (chatId) => {
    const queryClient = useQueryClient();
    const user = useAuthStore(state => state.user);

    useEffect(() => {
        if (!chatId || !user) return;

        // Emit view_chat event to tracking system
        socket.emit('agent:view_chat', { interactionId: chatId, agentName: user.name });



        return () => {
            socket.emit('agent:stop_view_chat', { interactionId: chatId });
        };
    }, [chatId, queryClient, user]);

    return useQuery({
        queryKey: ['messages', chatId],
        queryFn: () => chatService.getMessages(chatId),
        enabled: !!chatId,
        select: (data) => data.messages || [],
    });
};

// Send a message
export const useSendMessage = () => {
    const queryClient = useQueryClient();
    const user = useAuthStore(state => state.user);

    return useMutation({
        mutationFn: ({ chatId, content, tempId, attachments = [] }) => {
            const agentId = user?.id ? String(user.id) : null;
            const agentName = user?.name || 'Agent';
            const role = user?.role || 'agent';
            return chatService.sendMessage(chatId, content, agentId, agentName, role, tempId, attachments);
        },
        onMutate: async ({ chatId, content, tempId, attachments = [] }) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({ queryKey: ['messages', chatId] });

            // Snapshot the previous value
            const previousData = queryClient.getQueryData(['messages', chatId]);

            // Optimistically add message with 'pending' status
            queryClient.setQueryData(['messages', chatId], (oldData) => {
                const newMessage = {
                    id: tempId,
                    content,
                    sender: 'agent',
                    senderName: user?.name || 'Agent',
                    agentRole: user?.role || 'agent', // Explicitly include Role for styling
                    agentId: user?.id ? String(user.id) : null, // Explicitly include ID for 'Anda' check
                    timestamp: new Date().toISOString(),
                    status: 'pending',
                    type: attachments.length > 0 ? attachments[0].fileType : 'text',
                    attachments: attachments.map(att => ({
                        ...att,
                        // Use provided fileUrl directly - DO NOT create new blob URLs here
                        // Blob URL creation causes race conditions and "not found" errors
                        fileUrl: att.fileUrl || ''
                    }))
                };

                return {
                    ...oldData,
                    messages: [...(oldData?.messages || []), newMessage]
                };
            });

            return { previousData, tempId };
        },
        onSuccess: (data, variables) => {
            const { chatId, tempId } = variables;

            // Update message status to 'sent' and replace temp ID with real ID
            queryClient.setQueryData(['messages', chatId], (oldData) => {
                if (!oldData || !oldData.messages) return oldData;

                return {
                    ...oldData,
                    messages: oldData.messages.map(msg =>
                        msg.id === tempId
                            ? { ...msg, id: data.messageId || tempId, status: 'sent' }
                            : msg
                    )
                };
            });
        },
        onError: (err, variables, context) => {
            // Rollback to previous state on error
            if (context?.previousData) {
                queryClient.setQueryData(['messages', variables.chatId], context.previousData);
            }
        },
        // Removed onSettled invalidation - rely on real-time socket updates for status
    });
};

// Handle a chat
export const useHandleChat = () => {
    const queryClient = useQueryClient();
    const user = useAuthStore(state => state.user);

    return useMutation({
        mutationFn: ({ chatId, agentName }) => {
            const agentId = user?.id ? String(user.id) : 'Agent'; // Use ID for handle
            const finalAgentName = agentName || user?.name || 'Support Agent';
            return chatService.handleChat(chatId, agentId, finalAgentName);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['chats'] });
        }
    });
};

// Close a chat
export const useCloseChat = () => {
    const queryClient = useQueryClient();
    const user = useAuthStore(state => state.user);

    return useMutation({
        mutationFn: ({ chatId }) => {
            const agentId = user?.name || 'Agent';
            return chatService.closeChat(chatId, agentId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['chats'] });
        }
    });
};

// Transfer a chat
export const useTransferChat = () => {
    const queryClient = useQueryClient();
    const user = useAuthStore(state => state.user);

    return useMutation({
        mutationFn: ({ chatId, targetAgent }) => {
            console.log('[useTransferChat] args:', { chatId, targetAgent, user });
            const agentId = user?.id ? String(user.id) : 'Agent';
            const agentName = user?.name || 'Agent';
            const targetAgentId = targetAgent ? String(targetAgent.id) : null;
            const targetAgentName = targetAgent ? targetAgent.name : 'Queue';
            const targetAgentRole = targetAgent ? targetAgent.role : null;
            console.log('[useTransferChat] payload:', { chatId, agentId, agentName, targetAgentId, targetAgentName, targetAgentRole });

            return chatService.transferChat(chatId, agentId, agentName, targetAgentId, targetAgentName, targetAgentRole);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['chats'] });
        },
        onError: (error) => {
            console.error('[useTransferChat] Mutation error:', error);
        }
    });
};

// Get available agents
export const useAgents = () => {
    return useQuery({
        queryKey: ['agents'],
        queryFn: chatService.getAgents,
        staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    });
};
