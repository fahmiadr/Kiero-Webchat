import prisma from '../config/prismaClient.js';
import { incomingEventQueue, backgroundTaskQueue } from '../queues/eventQueues.js';
import { getWebhookDeliveryService } from './webhookDeliveryService.js';
import { botConfig } from '../config/botConfig.js';
import { socketEmitter } from '../config/redisClient.js';

/**
 * Service to handle Interaction Logic (Messages, Status)
 */
export class InteractionService {
    constructor(logger, io) {
        this.logger = logger;
        this.io = io;
        if (!io) {
            // Background worker fallback: use shared redis-emitter to broadcast events globally
            try {
                this.io = socketEmitter;
                this.logger.info('[InteractionService] Using shared Redis Emitter for background event broadcasting');
            } catch (err) {
                this.logger.error({ err }, '[InteractionService] Failed to initialize Redis Emitter');
            }
        }
        this.webhookService = getWebhookDeliveryService(logger);
    }

    /**
     * Send a message from Agent (or External Server) to Visitor
     */
    async sendMessage({ interactionId, agentId, agentName, role = 'agent', content, type = 'text', tempId, attachments = [], meta = {} }) {
        const interaction = await prisma.interaction.findUnique({
            where: { interactionId }
        });

        if (!interaction) {
            throw new Error('Interaction not found');
        }

        if (interaction.agentHandle !== String(agentId)) {
            if (!interaction.agentHandle) {
                // Allow "handling" via interactionService if we want? 
                // But generally sending a message implies you are handling it.
                // The user said "checking assignAgent should be here".
                throw new Error('Interaction is not handled by any agent. Please handle it first.');
            }
            throw new Error(`Unauthorized: Agent ${agentId} is not the handler of interaction ${interactionId}`);
        }

        const messageId = `MSG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        // Use provided Name or fallback to Interaction's current agent name
        const senderName = agentName || interaction.agentName || 'Agent';

        // 1. Store in DB
        await prisma.message.create({
            data: {
                messageId,
                interactionId,
                flagTo: 'customer',
                senderType: 'agent',
                message: content,
                messageType: type,

                // Multi-Agent History
                agentId: agentId || interaction.agentHandle, // Store ID of sender
                senderName: senderName, // Store Name Snapshot
                agentRole: role, // Store Role (agent, admin, supervisor)

                flagRead: 0,
                flagSent: 1,
                meta: Object.keys(meta).length > 0 ? meta : undefined,
                attachments: attachments.length > 0 ? {
                    create: attachments.map(att => ({
                        fileOrigin: att.fileOrigin,
                        fileName: att.fileName,
                        fileType: att.fileType,
                        fileSize: att.fileSize,
                        fileUrl: att.fileUrl,
                        meta: att.meta
                    }))
                } : undefined
            },
            include: { attachments: true }
        });

        // 2. Push to Widget (incoming-events queue)
        await incomingEventQueue.add('incoming-event', {
            type: 'message:receive',
            payload: {
                interactionId,
                clientId: interaction.clientId, // Required for Webhook Signature
                id: messageId, // Standardized as 'id'
                tempId, // Included for optimistic UI
                content,
                type,
                sender: 'agent',
                senderName,
                agentId,
                agentRole: role,
                timestamp: new Date().toISOString(),
                attachments,
                meta: Object.keys(meta).length > 0 ? meta : undefined
            }
        });

        // 3. Emit 'sent' status to agent via socket
        if (this.io) {
            this.io.to(interactionId).emit('message:status', {
                interactionId,
                messageId,
                tempId,
                status: 'sent'
            });

            // Also emit the message back to other agents in room (realtime sync)
            this.io.to(interactionId).emit('message:receive', {
                id: messageId,
                interactionId,
                content,
                type,
                sender: 'agent',
                senderName,
                agentId,
                agentRole: role,
                timestamp: new Date().toISOString(),
                attachments,
                meta: Object.keys(meta).length > 0 ? meta : undefined
            });
        }

        return { success: true, messageId };
    }

    /**
     * Agent assumes ownership of a chat
     */
    async handleChat({ interactionId, agentId, agentName, role = 'agent', isSystemAdmin = false }) {
        const interaction = await prisma.interaction.findUnique({
            where: { interactionId },
            include: { client: true }
        });
        if (!interaction) throw new Error('Interaction not found');

        if (interaction.statusChat === 'closed' || interaction.flagEnd === 'Y' || interaction.closedBy) {
            const error = new Error('Cannot handle a closed chat');
            error.code = 'CHAT_CLOSED';
            error.details = {
                closedBy: interaction.closedBy,
                closedByName: interaction.closedByName,
                closedReason: interaction.closedReason,
                closedRole: interaction.closedRole
            };
            throw error;
        }

        if (interaction.agentHandle && !isSystemAdmin) {
            const error = new Error('Chat already handled');
            error.code = 'CHAT_HANDLED';
            error.details = {
                agentHandle: interaction.agentHandle,
                agentName: interaction.agentName
            };
            throw error;
        }

        // ========== CORE: DB Update (Blocking) ==========
        await prisma.interaction.update({
            where: { interactionId },
            data: {
                agentHandle: agentId,
                agentName: agentName || 'Agent',
                handledBy: interaction.handledBy || agentId,
                handledByName: interaction.handledByName || (agentName || 'Agent'),
                waitingAgent: false,
                botActive: false
            }
        });

        // ========== CORE: Notify Widget (Blocking) ==========
        const customConnectedMessage = interaction.client?.botConfig?.agentConnectedMessage || botConfig.agentConnectedMessage;

        await incomingEventQueue.add('incoming-event', {
            type: 'agent:assigned',
            payload: {
                interactionId,
                clientId: interaction.clientId,
                agentId,
                agentName,
                agentRole: role,
                message: customConnectedMessage || 'You are now connected to an agent.'
            }
        });

        // ========== REALTIME: Notify Agents (Synchronous for UX) ==========
        if (this.io) {
            this.io.emit('interaction:update', {
                type: 'chat_handled',
                interactionId,
                agentHandle: agentId,
                agentName
            });

            this.io.to(interactionId).emit('message:receive', {
                id: `SYS-HND-${Date.now()}`,
                interactionId,
                type: 'system',
                content: `👤 Terhubung dengan ${agentName}`,
                timestamp: new Date().toISOString()
            });
        }

        // ========== BACKGROUND: System Event & Audit Log ==========
        backgroundTaskQueue.add('system_event', {
            taskType: 'system_event',
            payload: {
                eventType: 'agent_assigned',
                interactionId,
                params: { agentName: agentName || 'Agent' }
            }
        }).catch(err => this.logger.error({ err }, '[InteractionService] Failed to queue system_event'));

        backgroundTaskQueue.add('audit_log', {
            taskType: 'audit_log',
            payload: {
                level: 'INFO',
                source: 'agent',
                event: 'chat:handle',
                metadata: { interactionId, agentId, agentName }
            }
        }).catch(err => this.logger.error({ err }, '[InteractionService] Failed to queue audit_log'));

        // ========== CLEANUP: Remove auto-close delayed job if exists ==========
        try {
            const job = await backgroundTaskQueue.getJob(`waitTimeout_${interactionId}`);
            if (job) {
                await job.remove();
                this.logger.info({ interactionId }, '[InteractionService] Removed auto-close delayed job');
            }
        } catch (err) {
            this.logger.error({ err, interactionId }, '[InteractionService] Failed to remove auto-close job');
        }

        return { success: true };
    }

    /**
     * Close an interaction
     */
    async closeChat({ interactionId, closedBy, closedByName, closedReason = 'Agent closed the chat', closedRole = 'agent', isSystemAdmin = false }) {
        const interaction = await prisma.interaction.findUnique({ where: { interactionId } });
        if (!interaction) throw new Error('Interaction not found');

        if (interaction.statusChat === 'closed' || interaction.flagEnd === 'Y' || interaction.closedBy) {
            const error = new Error('Chat is already closed');
            error.code = 'CHAT_ALREADY_CLOSED';
            error.details = {
                closedBy: interaction.closedBy,
                closedByName: interaction.closedByName,
                closedReason: interaction.closedReason,
                closedRole: interaction.closedRole
            };
            throw error;
        }

        if (interaction.agentHandle && interaction.agentHandle !== String(closedBy) && !isSystemAdmin) {
            const error = new Error(`Unauthorized: Agent ${closedBy} is not authorized to close interaction ${interactionId}`);
            error.code = 'UNAUTHORIZED_ACTION';
            throw error;
        }

        // ========== CORE: DB Update (Blocking) ==========
        const updatedInteraction = await prisma.interaction.update({
            where: { interactionId },
            data: {
                statusChat: 'closed',
                flagEnd: 'Y',
                botActive: true,
                waitingAgent: false,
                agentHandle: null,
                agentName: null,
                closedBy,
                closedByName,
                closedReason,
                closedRole
            }
        });

        // ========== CORE: Notify Widget (Blocking) ==========
        await incomingEventQueue.add('incoming-event', {
            type: 'chat:closed',
            payload: {
                interactionId,
                closedBy,
                closedByName,
                closedRole
            }
        });

        // ========== REALTIME: Notify Agents (Synchronous for UX) ==========
        if (this.io) {
            this.io.emit('interaction:update', {
                type: 'chat_closed',
                interactionId,
                closedBy,
                closedReason,
                closedRole
            });

            this.io.to(interactionId).emit('message:receive', {
                id: `SYS-${Date.now()}`,
                interactionId,
                type: 'system',
                content: `Chat closed by ${closedByName || 'Agent'}.`,
                timestamp: new Date().toISOString()
            });
        }

        // ========== BACKGROUND: System Event ==========
        backgroundTaskQueue.add('system_event', {
            taskType: 'system_event',
            payload: {
                eventType: 'chat_closed',
                interactionId,
                params: {}
            }
        }).catch(err => this.logger.error({ err }, '[InteractionService] Failed to queue system_event'));

        // ========== BACKGROUND: Audit Log ==========
        backgroundTaskQueue.add('audit_log', {
            taskType: 'audit_log',
            payload: {
                level: 'INFO',
                source: 'agent',
                event: 'chat:close',
                metadata: { interactionId, closedBy, closedReason, closedRole }
            }
        }).catch(err => this.logger.error({ err }, '[InteractionService] Failed to queue audit_log'));

        // ========== BACKGROUND: Redis Session Invalidation ==========
        const visitorId = updatedInteraction.visitorId;
        if (visitorId) {
            this.logger.info({ visitorId, interactionId }, '[InteractionService] Queueing session invalidation');
            backgroundTaskQueue.add('redis_expire', {
                taskType: 'redis_expire',
                payload: {
                    keys: [
                        `session:${visitorId}`,
                        `sessionSocket:${visitorId}`,
                        `interaction:${interactionId}`
                    ],
                    ttl: 60
                }
            }).catch(err => this.logger.error({ err }, '[InteractionService] Failed to queue redis_expire'));
        }

        return { success: true };
    }

    /**
     * Transfer an interaction to another agent or queue
     */
    async transferChat({ interactionId, agentId, agentRole = 'agent', isSystemAdmin = false, targetAgentId, targetAgentName, targetAgentRole }) {
        const interaction = await prisma.interaction.findUnique({ where: { interactionId } });
        if (!interaction) throw new Error('Interaction not found');

        if (interaction.agentHandle !== String(agentId) && !isSystemAdmin) {
            throw new Error(`Unauthorized: Agent ${agentId} is not the handler of interaction ${interactionId}`);
        }

        const isBackToQueue = !targetAgentId;

        // ========== CORE: DB Update (Blocking) ==========
        await prisma.interaction.update({
            where: { interactionId },
            data: {
                agentHandle: targetAgentId || null,
                agentName: targetAgentName || null,
                waitingAgent: isBackToQueue,
                botActive: false
            }
        });

        // ========== CORE: Notify Widget (Blocking) ==========
        if (isBackToQueue) {
            await incomingEventQueue.add('incoming-event', {
                type: 'agent:waiting',
                payload: {
                    interactionId,
                    message: 'You have been transferred to the queue.'
                }
            });
        } else {
            const finalRole = targetAgentRole || 'agent';
            await incomingEventQueue.add('incoming-event', {
                type: 'agent:assigned',
                payload: {
                    interactionId,
                    agentId: targetAgentId,
                    agentName: targetAgentName,
                    agentRole: finalRole,
                    message: `You are now connected with ${targetAgentName}.`
                }
            });
        }

        // ========== REALTIME: Notify Agents (Synchronous for UX) ==========
        // Generate system message ID upfront for socket sync
        const sysMessageId = `SYS_chat_transferred_${Date.now()}`;
        const sysContent = targetAgentName
            ? `🔄 Chat ditransfer ke ${targetAgentName}`
            : '🔄 Chat dikembalikan ke antrian';

        if (this.io) {
            this.io.emit('interaction:update', {
                type: 'chat_transfer',
                interactionId,
                newAgentId: targetAgentId,
                status: isBackToQueue ? 'waiting' : 'handled'
            });

            this.io.to(interactionId).emit('message:receive', {
                id: sysMessageId,
                interactionId,
                type: 'system',
                content: sysContent,
                timestamp: new Date().toISOString()
            });
        }

        // ========== BACKGROUND: System Event ==========
        backgroundTaskQueue.add('system_event', {
            taskType: 'system_event',
            payload: {
                eventType: 'chat_transferred',
                interactionId,
                params: { targetName: targetAgentName }
            }
        }).catch(err => this.logger.error({ err }, '[InteractionService] Failed to queue system_event'));

        // ========== BACKGROUND: Audit Log ==========
        backgroundTaskQueue.add('audit_log', {
            taskType: 'audit_log',
            payload: {
                level: 'INFO',
                source: 'agent',
                event: 'chat:transfer',
                metadata: { interactionId, from: agentId, to: targetAgentId || 'QUEUE' }
            }
        }).catch(err => this.logger.error({ err }, '[InteractionService] Failed to queue audit_log'));

        return { success: true };
    }

    /**
     * Mark visitor messages as read
     */
    async markMessagesAsRead({ interactionId, messageIds }) {
        if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
            throw new Error('messageIds (array) is required');
        }

        // Update DB
        await prisma.message.updateMany({
            where: {
                interactionId,
                messageId: { in: messageIds },
                senderType: 'visitor',
                flagRead: 0
            },
            data: { flagRead: 1 }
        });

        // Notify Widget (Batch)
        // Check incomingWorker.js logic: it handles `messageIds` array in `message:status` event.
        await incomingEventQueue.add('incoming-event', {
            type: 'message:status',
            payload: {
                interactionId,
                status: 'read',
                messageIds // Send array directly
            }
        });

        // Notify Agents via Socket
        if (this.io) {
            messageIds.forEach(id => {
                this.io.to(interactionId).emit('message:status', {
                    interactionId,
                    messageId: id,
                    status: 'read'
                });
            });
        }

        return { success: true };
    }

    /**
     * Send typing indicator from agent
     */
    async sendTypingIndicator({ interactionId, isTyping, agentId, agentName, agentRole }) {
        // Determine agent name to show - use passed name or 'Agent'

        // Notify Widget
        await incomingEventQueue.add('incoming-event', {
            type: 'typing:agent',
            payload: {
                interactionId,
                isTyping,
                agentId,
                agentName: agentName || 'Agent',
                agentRole
            }
        });

        // Notify other agents (optional, but good for collision detection)
        if (this.io) {
            this.io.to(interactionId).emit('agent:typing', {
                interactionId,
                isTyping,
                agentId,
                agentName: agentName,
                agentRole
            });
        }

        return { success: true };
    }
}
