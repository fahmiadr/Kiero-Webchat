/**
 * Socket.IO Event Handlers for Agent Backend
 * 
 * Handles agent-side socket events:
 * - join_room: Agent joins a specific chat room
 * - leave_room: Agent leaves a chat room
 * - agent:typing: Agent typing indicator
 * - agent:handle_chat: Agent takes over chat from bot
 */
import { InteractionService } from '../services/interactionService.js';

export function setupSocketHandlers(io, fastify) {
    const interactionService = new InteractionService(fastify.log, io);

    io.on('connection', (socket) => {
        fastify.log.info(`[Socket] Agent connected: ${socket.id}`);

        // Agent joins a specific interaction room
        socket.on('join_room', (room) => {
            socket.join(room);
            fastify.log.info(`[Socket] Agent ${socket.id} joined room: ${room}`);
        });

        // Agent leaves a room
        socket.on('leave_room', (room) => {
            socket.leave(room);
            fastify.log.info(`[Socket] Agent ${socket.id} left room: ${room}`);
        });

        // Admin subscribes to realtime audit logs
        socket.on('admin:subscribe_logs', ({ role }) => {
            // Only allow admin role to subscribe
            if (role === 'admin') {
                socket.join('admin:logs');
                fastify.log.info({ socketId: socket.id }, '[Socket] Admin subscribed to audit logs');
                socket.emit('admin:logs_subscribed', { success: true });
            } else {
                socket.emit('admin:logs_subscribed', { success: false, error: 'Unauthorized' });
            }
        });

        // Admin unsubscribes from logs
        socket.on('admin:unsubscribe_logs', () => {
            socket.leave('admin:logs');
            fastify.log.info({ socketId: socket.id }, '[Socket] Admin unsubscribed from audit logs');
        });

        // Agent typing indicator (broadcast to room + forward to client)
        socket.on('agent:typing', async ({ interactionId, isTyping, agentName, agentId, agentRole }) => {
            try {
                // Delegate to InteractionService
                await interactionService.sendTypingIndicator({
                    interactionId,
                    isTyping,
                    agentId,
                    agentName,
                    agentRole
                });
                fastify.log.info(`[Socket] Agent typing in ${interactionId}: ${isTyping}`);
            } catch (error) {
                fastify.log.error({ err: error }, '[Socket] Failed to process agent typing');
            }
        });

        // Agent starts viewing a chat
        socket.on('agent:view_chat', ({ interactionId, agentName }) => {
            socket.join(interactionId); // Join room to receive messages

            // Add to viewers list (In-memory storage for MVP)
            if (!fastify.chatViewers) fastify.chatViewers = new Map();
            if (!fastify.chatViewers.has(interactionId)) fastify.chatViewers.set(interactionId, new Set());

            // Store viewer info (using socket.id as key for uniqueness, or agentId if available)
            // Storing object { name: agentName, id: socket.id }
            const viewers = fastify.chatViewers.get(interactionId);

            // Remove existing entry for this socket if any (to update name or avoid dupes)
            for (const v of viewers) {
                if (v.id === socket.id) viewers.delete(v);
            }

            viewers.add({ id: socket.id, name: agentName });

            // Broadcast update to ALL agents (using a global 'agents' room or just broadcast)
            // Ideally activeChatList listens to 'interaction:update' or specific 'chat:viewers_update'
            io.emit('chat:viewers_update', {
                interactionId,
                viewers: Array.from(viewers)
            });

            fastify.log.info(`[Socket] Agent ${agentName} viewing ${interactionId}`);
        });

        // Agent stops viewing
        socket.on('agent:stop_view_chat', ({ interactionId }) => {
            socket.leave(interactionId); // Leave message room

            if (fastify.chatViewers && fastify.chatViewers.has(interactionId)) {
                const viewers = fastify.chatViewers.get(interactionId);
                for (const v of viewers) {
                    if (v.id === socket.id) viewers.delete(v);
                }

                // Broadcast update
                io.emit('chat:viewers_update', {
                    interactionId,
                    viewers: Array.from(viewers)
                });
            }
        });

        // Agent marks messages as read
        socket.on('agent:mark_read', async ({ interactionId, messageIds }) => {
            if (!interactionId || !messageIds || messageIds.length === 0) {
                fastify.log.warn('[Socket] Invalid mark_read payload');
                return;
            }

            try {
                // Delegate to InteractionService
                await interactionService.markMessagesAsRead({
                    interactionId,
                    messageIds
                });

                fastify.log.info(`[Socket] Marked ${messageIds.length} messages as read in ${interactionId} via Service`);

                // Since Service handles broadcasting 'message:status' (read), we only need to confirm to sender if needed.
                // The service emits to "interactionId" room, which this socket IS part of (if joined).
                // However, often frontend expects a specific callback or immediate confirmation.
                // We'll emit a confirmation just to be safe/consistent with previous behavior for the sender.
                socket.emit('messages:marked_read', {
                    interactionId,
                    messageIds,
                    success: true
                });

            } catch (error) {
                fastify.log.error({ err: error }, '[Socket] Failed to mark messages as read');
                socket.emit('messages:marked_read', { success: false, error: error.message });
            }
        });

        // Agent broadcast (ephemeral chat)
        socket.on('agent:broadcast_message', (payload) => {
            // payload: { id, sender, content, timestamp }
            // Broadcast to all connected clients (including sender, for simplicity, or exclude sender)
            io.emit('agent:broadcast_message', payload);
            fastify.log.info(`[Socket] Broadcast from ${payload.sender}: ${payload.content}`);
        });

        // Agent comes online (registers presence)
        socket.on('agent:online', ({ agentName, agentId }) => {
            if (!fastify.onlineAgents) fastify.onlineAgents = new Map();

            // Store using socket.id as key
            fastify.onlineAgents.set(socket.id, { id: agentId || socket.id, name: agentName });

            // Broadcast full list
            const agentsList = Array.from(fastify.onlineAgents.values());
            // Deduplicate by name/id if needed, but for now simple list
            // We might want unique agents (not sockets), so let's map to unique agents
            const uniqueAgents = Array.from(new Map(
                agentsList.map(a => [a.id, a]) // Map by ID to dedupe (if multiple tabs open)
            ).values());

            io.emit('agents:update', uniqueAgents);
            fastify.log.info(`[Socket] Agent Online: ${agentName}`);
        });

        socket.on('disconnect', (reason) => {
            fastify.log.info(`[Socket] Agent disconnected: ${socket.id} | Reason: ${reason}`);

            // Cleanup Viewers
            if (fastify.chatViewers) {
                for (const [interactionId, viewers] of fastify.chatViewers.entries()) {
                    let changed = false;
                    for (const v of viewers) {
                        if (v.id === socket.id) {
                            viewers.delete(v);
                            changed = true;
                        }
                    }
                    if (changed) {
                        io.emit('chat:viewers_update', {
                            interactionId,
                            viewers: Array.from(viewers)
                        });
                    }
                }
            }

            // Cleanup Online Agents
            if (fastify.onlineAgents && fastify.onlineAgents.has(socket.id)) {
                fastify.onlineAgents.delete(socket.id);

                // Broadcast update
                const agentsList = Array.from(fastify.onlineAgents.values());
                const uniqueAgents = Array.from(new Map(
                    agentsList.map(a => [a.id, a])
                ).values());

                io.emit('agents:update', uniqueAgents);
            }
        });
    });
}

