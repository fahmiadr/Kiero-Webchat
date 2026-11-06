import { botConfig } from '../config/botConfig.js';
import { authenticate } from '../middlewares/auth.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
async function chatRoutes(fastify) {
    /**
     * GET /api/chat
     * Returns list of active interactions
     */
    fastify.get('/', {
        preValidation: [authenticate],
        schema: {
            response: {
                200: {
                    type: 'object',
                    properties: {
                        chats: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string' },
                                    name: { type: 'string' },
                                    email: { type: 'string' },
                                    visitorId: { type: 'string' },
                                    lastMessage: { type: 'string' },
                                    startTime: { type: 'string' },
                                    unread: { type: 'integer' },
                                    channel: { type: 'string' },
                                    waitingAgent: { type: 'boolean' },
                                    agentHandle: { type: ['string', 'null'] },
                                    agentName: { type: ['string', 'null'] },
                                    botName: { type: 'string' },
                                    // Closing Info
                                    closedBy: { type: ['string', 'null'] },
                                    closedByName: { type: ['string', 'null'] },
                                    closedReason: { type: ['string', 'null'] },
                                    closedRole: { type: ['string', 'null'] }
                                }
                            }
                        }
                    }
                }
            }
        }
    }, async (request, reply) => {
        const prisma = fastify.prisma;

        try {
            // Fetch ACTIVE interactions (open AND (waiting OR handled))
            const interactions = await prisma.interaction.findMany({
                where: {
                    statusChat: 'open',
                    OR: [
                        { waitingAgent: true },
                        { agentHandle: { not: null } }
                    ]
                },
                orderBy: { dateCreate: 'desc' },
                include: {
                    messages: {
                        orderBy: { createdAt: 'desc' },
                        take: 1
                    },
                    _count: {
                        select: {
                            messages: {
                                where: {
                                    flagRead: 0,
                                    flagTo: 'agent'
                                }
                            }
                        }
                    }
                }
            });

            const formattedChats = interactions.map(chat => {
                const lastMsg = chat.messages[0];
                return {
                    id: chat.interactionId,
                    name: chat.name || 'Visitor',
                    email: chat.email,
                    visitorId: chat.visitorId,
                    lastMessage: lastMsg ? lastMsg.message : 'No messages',
                    startTime: chat.dateCreate.toISOString(), // Chat start time
                    unread: chat._count.messages,
                    agentHandle: chat.agentHandle,
                    agentName: chat.agentName,
                    waitingAgent: chat.waitingAgent,
                    channel: chat.channel || 'web',
                    botName: botConfig.name || 'Support Bot',
                    closedBy: chat.closedBy,
                    closedByName: chat.closedByName,
                    closedReason: chat.closedReason,
                    closedRole: chat.closedRole
                };
            });

            return { chats: formattedChats };
        } catch (error) {
            request.log.error(error, 'Failed to fetch chats');
            return reply.code(500).send({ error: 'Failed to fetch chats' });
        }
    });

    /**
     * GET /api/chat/:interactionId/messages
     * Returns message history for an interaction
     */
    fastify.get('/:interactionId/messages', {
        preValidation: [authenticate],
        schema: {
            params: {
                type: 'object',
                properties: {
                    interactionId: { type: 'string' }
                },
                required: ['interactionId']
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        messages: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string' },
                                    content: { type: 'string' },
                                    type: { type: 'string' },
                                    sender: { type: 'string' },
                                    senderName: { type: ['string', 'null'] },
                                    agentId: { type: ['string', 'null'] }, // Added
                                    agentRole: { type: ['string', 'null'] }, // Added
                                    timestamp: { type: 'string' },
                                    status: { type: 'string' },
                                    meta: { type: 'object', additionalProperties: true, nullable: true },
                                    attachments: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                fileOrigin: { type: 'string' },
                                                fileName: { type: 'string' },
                                                fileType: { type: 'string' },
                                                fileSize: { type: ['integer', 'null'] },
                                                fileUrl: { type: 'string' },
                                                meta: { type: 'object', additionalProperties: true, nullable: true }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }, async (request, reply) => {
        const { interactionId } = request.params;
        const prisma = fastify.prisma;

        try {
            // Single query: Fetch interaction with all messages
            const interaction = await prisma.interaction.findUnique({
                where: { interactionId },
                include: {
                    messages: {
                        orderBy: { createdAt: 'asc' },
                        include: {
                            attachments: true
                        }
                    }
                }
            });

            if (!interaction) {
                return reply.code(404).send({ error: 'Interaction not found' });
            }

            // Transform to expected format
            // senderType: 'visitor', 'bot', or 'agent'
            const formattedMessages = interaction.messages.map(msg => {
                // Determine senderName: Prefer stored snapshot, fallback to relations logic
                let senderName = msg.senderName;
                if (!senderName) {
                    if (msg.senderType === 'bot') {
                        senderName = botConfig?.name || 'Support Bot';
                    } else if (msg.senderType === 'agent') {
                        senderName = interaction.agentName || 'Agent';
                    } else if (msg.senderType === 'visitor') {
                        senderName = interaction.name || 'Visitor';
                    }
                }

                return {
                    id: msg.messageId,
                    content: msg.message,
                    type: msg.messageType,
                    sender: msg.senderType,
                    senderName,
                    agentId: msg.agentId,
                    agentRole: msg.agentRole,
                    timestamp: msg.createdAt.toISOString(),
                    status: msg.flagRead === 1 ? 'read' : (msg.flagSent === 1 ? 'delivered' : 'pending'),
                    meta: msg.meta || null,
                    attachments: msg.attachments.map(att => ({
                        fileOrigin: att.fileOrigin,
                        fileName: att.fileName,
                        fileType: att.fileType,
                        fileSize: att.fileSize,
                        fileUrl: att.fileUrl,
                        meta: att.meta
                    }))
                };
            });

            return { messages: formattedMessages };
        } catch (error) {
            request.log.error(error, 'Failed to fetch message history');
            return reply.code(500).send({
                success: false,
                error: 'Failed to fetch message history'
            });
        }
    });

    /**
     * POST /api/chat/:interactionId/messages
     * Sends a message from Agent to Customer
     */
    fastify.post('/:interactionId/messages', {
        preValidation: [authenticate],
        schema: {
            params: {
                type: 'object',
                properties: {
                    interactionId: { type: 'string' }
                },
                required: ['interactionId']
            },
            body: {
                type: 'object',
                properties: {
                    content: { type: 'string' },
                    type: { type: 'string', default: 'text' },
                    agentId: { type: 'string' },
                    agentName: { type: 'string' }, // Explicit override
                    role: { type: 'string' }, // Explicit override
                    tempId: { type: 'string' },
                    attachments: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['fileName', 'fileType', 'fileUrl', 'fileOrigin'],
                            properties: {
                                fileName: { type: 'string' },
                                fileType: { type: 'string' },
                                fileUrl: { type: 'string' },
                                fileSize: { type: 'integer' },
                                fileOrigin: { type: 'string' },
                                meta: { type: 'object', additionalProperties: true, nullable: true }
                            }
                        }
                    }
                },
                required: []
            }
        }
    }, async (request, reply) => {
        const { interactionId } = request.params;
        const { content, type, tempId, attachments, agentId: bodyAgentId, agentName: bodyAgentName, role: bodyRole } = request.body;
        const prisma = fastify.prisma;

        try {
            // Check interaction exists
            const interaction = await prisma.interaction.findUnique({
                where: { interactionId }
            });

            if (!interaction) {
                return reply.code(404).send({ error: 'Interaction not found' });
            }

            // Determine Agent Context
            const isExternal = request.user.role === 'external_server';
            const agentId = isExternal ? bodyAgentId : String(request.user.id);
            const agentName = isExternal ? bodyAgentName : request.user.name;
            const agentRole = isExternal ? (bodyRole || 'agent') : request.user.role;

            // Permission Check: Delegated to InteractionService
            // The service enforces that the sender MUST be the current handler (agentHandle).

            // USE SERVICE
            const { InteractionService } = await import('../services/interactionService.js');
            const interactionService = new InteractionService(request.log, fastify.io);

            const result = await interactionService.sendMessage({
                interactionId,
                agentId,
                agentName,
                role: agentRole,
                content: content || '',
                type,
                tempId,
                attachments
            });

            return result;
        } catch (error) {
            request.log.error(error, 'Failed to send message');
            return reply.code(500).send({ error: 'Failed to send message' });
        }
    });

    /**
     * POST /api/chat/:interactionId/handle
     * Agent takes ownership of the chat
     */
    fastify.post('/:interactionId/handle', {
        preValidation: [authenticate],
        schema: {
            params: {
                type: 'object',
                properties: {
                    interactionId: { type: 'string' }
                },
                required: ['interactionId']
            },
            body: {
                type: 'object',
                properties: {
                    agentId: { type: 'string' },
                    agentName: { type: 'string' },
                    role: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        const { interactionId } = request.params;
        const isExternal = request.user.role === 'external_server';
        const agentId = isExternal ? request.body.agentId : String(request.user.id);
        const agentName = request.body.agentName || request.user.name;

        const agentRole = isExternal ? (request.body.role || 'agent') : request.user.role;
        const isSystemAdmin = !isExternal && request.user.role === 'admin';

        try {
            // USE SERVICE
            const { InteractionService } = await import('../services/interactionService.js');
            const interactionService = new InteractionService(request.log, fastify.io);

            await interactionService.handleChat({
                interactionId,
                agentId,
                agentName,
                role: agentRole,
                isSystemAdmin
            });

            return { success: true };
        } catch (error) {
            request.log.error(error, 'Failed to handle chat');
            if (error.code) {
                return reply.code(400).send({
                    success: false,
                    error: error.message,
                    code: error.code,
                    details: error.details
                });
            }
            return reply.code(500).send({ success: false, error: error.message || 'Failed to handle chat' });
        }
    });

    /**
     * POST /api/chat/:interactionId/close
     * Agent closes the chat
     */
    fastify.post('/:interactionId/close', {
        preValidation: [authenticate],
        schema: {
            params: {
                type: 'object',
                properties: {
                    interactionId: { type: 'string' }
                },
                required: ['interactionId']
            },
            body: {
                type: 'object',
                properties: {
                    reason: { type: 'string' },
                    closedBy: { type: 'string' },
                    closedByName: { type: 'string' },
                    closedRole: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        const { interactionId } = request.params;
        const { reason, closedBy: bodyClosedBy, closedByName: bodyClosedByName, closedRole: bodyClosedRole } = request.body;

        const isExternal = request.user.role === 'external_server';
        // External: Use body param, or fallback to 'system' logic if missing
        // Internal: Use user token
        const closedBy = isExternal ? (bodyClosedBy || String(request.user.id)) : String(request.user.id);
        const closedByName = isExternal ? (bodyClosedByName || request.user.name || 'System') : request.user.name;
        // User requested to take closedRole from body
        const closedRole = isExternal ? (bodyClosedRole || 'system') : request.user.role;
        const isSystemAdmin = !isExternal && request.user.role === 'admin';

        try {
            // USE SERVICE
            const { InteractionService } = await import('../services/interactionService.js');
            const interactionService = new InteractionService(request.log, fastify.io);

            await interactionService.closeChat({
                interactionId,
                closedBy,
                closedByName,
                closedReason: reason,
                closedRole,
                isSystemAdmin
            });

            return { success: true };
        } catch (error) {
            request.log.error(error, 'Failed to close chat');
            if (error.code) {
                return reply.code(400).send({
                    success: false,
                    error: error.message,
                    code: error.code,
                    details: error.details
                });
            }
            return reply.code(500).send({ success: false, error: error.message || 'Failed to close chat' });
        }
    });

    /**
     * POST /api/chat/:interactionId/transfer
     * Transfer chat to another agent or queue
     */
    fastify.post('/:interactionId/transfer', {
        preValidation: [authenticate],
        schema: {
            params: {
                type: 'object',
                properties: {
                    interactionId: { type: 'string' }
                },
                required: ['interactionId']
            },
            body: {
                type: 'object',
                properties: {
                    targetAgentId: { type: 'string' },
                    targetAgentName: { type: 'string' },
                    targetAgentRole: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        const { interactionId } = request.params;
        const { targetAgentId, targetAgentName, targetAgentRole } = request.body;

        const isExternal = request.user.role === 'external_server';
        const agentId = isExternal ? request.body.agentId : String(request.user.id);
        const isSystemAdmin = !isExternal && request.user.role === 'admin';

        try {
            const { InteractionService } = await import('../services/interactionService.js');
            const interactionService = new InteractionService(request.log, fastify.io);

            const agentRole = isExternal ? (request.body.role || 'agent') : request.user.role;

            await interactionService.transferChat({
                interactionId,
                agentId,
                agentRole,
                isSystemAdmin,
                targetAgentId,
                targetAgentName,
                targetAgentRole
            });

            return { success: true };
        } catch (error) {
            request.log.error(error, 'Failed to transfer chat');
            return reply.code(500).send({ success: false, error: 'Failed to transfer chat' });
        }
    });
}

export default chatRoutes;
