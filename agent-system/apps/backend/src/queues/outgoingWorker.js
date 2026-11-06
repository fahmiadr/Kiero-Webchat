/**
 * Outgoing Event Worker
 * 
 * Processes events from Widget Backend (via outgoing-events queue)
 * Replaces the mock-backend.js logic with real database persistence
 * 
 * Events handled:
 * - new_chat: Creates interaction in database
 * - new_message: Stores message and sends response
 * - typing_message: Logs typing indicator
 * - read_message: Updates message read status
 * - chat_closed: Closes interaction
 */
import { Worker } from 'bullmq';
import { bullMqConnection, bullMqWorkerPresets, config } from '../config/index.js';
import { incomingEventQueue, eventDlqQueue } from './eventQueues.js';
import { verifySignature, extractSignature } from '../services/signatureService.js';
import prisma from '../config/prismaClient.js';
import { getBotService } from '../services/botService.js';
import { botConfig } from '../config/botConfig.js';
import { storeBotConnectedEvent, storeChatClosedEvent } from '../services/systemEventService.js';
import { getWebhookDeliveryService } from '../services/webhookDeliveryService.js';
import { getMimeType } from '../utils/mime.js';

/**
 * Helper to add jobs to incoming queue (response back to widget-backend)
 */
const sendToWidget = async (type, payload, logger) => {
    try {
        await incomingEventQueue.add('incoming-event', { type, payload });
        logger.info(`[AgentWorker] Queued response: ${type}`);
    } catch (err) {
        logger.error(`[AgentWorker] Failed to queue response ${type}: ${err.message}`);
    }
};

/**
 * Starts the outgoing event worker
 */
export function startOutgoingWorker(logger, io) {
    logger.info('[OutgoingWorker] Starting worker for outgoing-events');

    const worker = new Worker('outgoing-events', async (job) => {
        const startTime = Date.now();
        const { payload, signature } = extractSignature(job.data);
        const { event, clientId, sessionId, interactionId, messageId, visitor, timestamp, message } = payload;

        logger.info(`[AgentWorker] Processing Job:${job.id} | Event:${event} | Client:${clientId}`);

        if (!clientId) {
            logger.error(`[AgentWorker] ❌ Missing clientId for Job:${job.id}. Dropping job.`);
            return;
        }

        try {
            // =================================================================
            // STEP 1: Lookup Widget Client for signature verification
            // =================================================================
            const widgetClient = await prisma.widgetClient.findUnique({
                where: {
                    clientId: clientId
                }
            });

            // Check active status manually since findUnique only accepts unique where input
            if (widgetClient && !widgetClient.active) {
                logger.warn(`[AgentWorker] WidgetClient is inactive: ${clientId}`);
                // Treat as not found or unauthorized
                if (config.env === 'production') {
                    throw new Error(`Unauthorized: Widget client is inactive`);
                }
            }

            if (!widgetClient) {
                logger.warn(`[AgentWorker] No active WidgetClient found for clientId: ${clientId}`);
                // For development, allow processing without client
                // In production, throw error
                if (config.env === 'production') {
                    throw new Error(`Unauthorized: No widget client for clientId ${clientId}`);
                }
            }

            // =================================================================
            // STEP 2: Verify Signature using global WEBHOOK_SECRET
            // =================================================================
            if (signature) {
                const isValid = verifySignature(payload, signature, config.webhookSecret);
                if (!isValid) {
                    logger.error(`[AgentWorker] ❌ Invalid signature for Job:${job.id}`);
                    throw new Error('Invalid signature');
                }
                logger.info(`[AgentWorker] Signature verified for Job:${job.id}`);
            }

            // =================================================================
            // STEP 3: Process Events (Business Logic)
            // =================================================================
            if (event === 'new_chat') {
                const newInteractionId = `INT${Date.now()}`;
                // Refactor: Use visitorId (Unified)
                // We use sessionId as the visitorId
                const visitorId = sessionId;

                // Create interaction in database
                await prisma.interaction.create({
                    data: {
                        interactionId: newInteractionId,
                        clientId, // Use clientId
                        visitorId: visitorId, // Unified ID
                        name: visitor?.name || 'Anonymous',
                        email: visitor?.email || null,
                        statusChat: 'open',
                        channel: 'webchat',
                        botActive: true,      // Bot handles initially
                        waitingAgent: false
                    }
                });
                logger.info(`[AgentWorker] Created interaction: ${newInteractionId}`);

                // Audit log: New chat started
                const { getAuditLogService } = await import('../services/auditLogService.js');
                getAuditLogService().log({
                    level: 'INFO',
                    source: 'widget',
                    event: 'chat:new',
                    metadata: {
                        interactionId: newInteractionId,
                        visitorId, // Updated
                        visitorName: visitor?.name || 'Anonymous'
                    },
                    clientId
                });

                // Realtime: Notify agents of new chat
                if (io) {
                    io.emit('interaction:update', { type: 'new_chat', interactionId: newInteractionId });
                }

                // Store bot connected system event in database
                await storeBotConnectedEvent(newInteractionId, botConfig.name);

                // Realtime: Emit system event via widget backend (Robust routing with forceRoom)
                await sendToWidget('system:message', {
                    interactionId: newInteractionId,
                    messageId: `SYS_${Date.now()}`,
                    content: `🤖 Terhubung dengan ${botConfig.name}`,
                    eventType: 'bot_connected',
                    timestamp: new Date().toISOString(),
                    forceRoom: sessionId // Ensure it reaches visitor even if not joined interaction room yet
                }, logger);

                // Send response back to widget with bot info
                await sendToWidget('session:updated', {
                    sessionId,
                    interactionId: newInteractionId,
                    visitorId, // Updated logic
                    connectionType: 'bot',
                    botInfo: {
                        name: botConfig.name,
                        isBot: true
                    }
                }, logger);

                // Trigger Bot Service welcome message (Delay for natural flow)
                setTimeout(async () => {
                    const botService = getBotService(logger, io);
                    await botService.handleNewSession({
                        sessionId,
                        interactionId: newInteractionId,
                        clientId,
                        visitor
                    });
                }, 1000);
            }

            else if (event === 'new_message') {
                logger.info(`[AgentWorker] Processing new_message | Interaction:${interactionId} | MsgId:${messageId}`);

                // Validate interaction exists before storing message
                const interaction = await prisma.interaction.findUnique({
                    where: { interactionId: interactionId || sessionId }
                });

                if (!interaction) {
                    logger.warn(`[AgentWorker] Interaction not found: ${interactionId} - sending session:invalid`);
                    await sendToWidget('session:invalid', {
                        sessionId,
                        interactionId,
                        reason: 'interaction_not_found'
                    }, logger);
                    return { success: false, reason: 'interaction_not_found' };
                }

                // Store visitor message in database
                const storedMessage = await prisma.message.create({
                    data: {
                        messageId,
                        interactionId: interactionId || sessionId,
                        flagTo: interaction.botActive ? 'bot' : 'agent', // Dynamic Flag
                        senderType: 'visitor',
                        senderName: visitor?.name || interaction.name || 'Visitor', // Add senderName for visitor
                        agentId: null, // Visitor messages don't have an agentId
                        message: message?.content || '',
                        messageType: message?.type || 'text',
                        flagRead: interaction.botActive ? 1 : 0, // Auto-read if Bot
                        flagSent: 1,
                        meta: message?.meta || undefined, // Store metadata (e.g. location address)
                        // Create related attachments if present (Standardized Payload)
                        attachments: message?.attachments && message.attachments.length > 0 ? {
                            create: message.attachments.map(att => ({
                                fileOrigin: att.fileOrigin || att.fileName,
                                fileName: att.fileName,
                                fileType: att.fileType,
                                fileSize: att.fileSize || 0,
                                fileUrl: att.fileUrl,
                                meta: att.meta // Save dimensions/metadata
                            }))
                        } : undefined
                    },
                    include: {
                        attachments: true
                    }
                });
                logger.info(`[AgentWorker] Stored message: ${storedMessage.id}`);

                // Calculate authoritative unread count from database (Single Source of Truth)
                const unreadCount = await prisma.message.count({
                    where: {
                        interactionId: interactionId || sessionId,
                        senderType: 'visitor',
                        flagRead: 0
                    }
                });

                // Realtime: Emit message to agent in the room
                if (io) {
                    const realtimeMsg = {
                        id: messageId,
                        interactionId: interactionId || sessionId, // CRITICAL: Required for global listener
                        content: message?.content || '',
                        type: message?.type || 'text',
                        sender: 'visitor',
                        timestamp: new Date().toISOString(),
                        status: 'sent',
                        meta: message?.meta, // Pass metadata to agent frontend
                        // Include stored attachments with metadata
                        attachments: storedMessage.attachments.map(att => ({
                            fileOrigin: att.fileOrigin,
                            fileType: att.fileType,
                            fileSize: att.fileSize,
                            fileUrl: att.fileUrl,
                            meta: att.meta,
                            fileName: att.fileName
                        })),
                        unreadCount // Authoritative count from DB
                    };
                    io.to(interactionId || sessionId).emit('message:receive', realtimeMsg);
                    io.emit('interaction:update', { type: 'new_message', interactionId: interactionId || sessionId, unreadCount });
                }

                // Send DELIVERED status
                await sendToWidget('message:status', {
                    interactionId,
                    messageId,
                    status: 'delivered'
                }, logger);

                // Forward to Bot Service if active
                if (interaction.botActive) {
                    const botService = getBotService(logger, io);
                    await botService.handleMessage({
                        interactionId: interactionId || sessionId,
                        clientId,
                        messageId,
                        content: message?.content || ''
                    });
                }

                // Forward to External Webhook (Requirement 2: Visitor Message)
                // Only if Bot is NOT active (Requirement: Filter events when bot is active)
                if (!interaction.botActive) {
                    const webhookService = getWebhookDeliveryService(logger);

                    // Construct payload matching user requirement
                    const webhookPayload = {
                        channel_id: clientId, // Use clientId
                        interaction_id: interactionId || sessionId, // New field
                        messages: [{
                            id: messageId,
                            is_bot: false,
                            from: {
                                id: visitor?.id || sessionId, // Use sessionId as fallback ID
                                name: visitor?.name || interaction.name || 'Visitor',
                                username: visitor?.email || interaction.email || 'visitor@email.com'
                            },
                            type: message?.type || 'text',
                            timestamp: Math.floor(new Date().getTime() / 1000)
                        }]
                    };

                    // Handle location type
                    if (message.type === 'location') {
                        let latitude = '';
                        let longitude = '';
                        try {
                            // URL format: https://www.google.com/maps?q=lat,lng
                            const url = new URL(message.content);
                            const params = new URLSearchParams(url.search);
                            const q = params.get('q');
                            if (q) {
                                const parts = q.split(',');
                                if (parts.length >= 2) {
                                    latitude = parts[0].trim();
                                    longitude = parts[1].trim();
                                }
                            }
                        } catch (e) {
                            logger.error(`[AgentWorker] Failed to parse location URL: ${message.content}`, e);
                        }

                        webhookPayload.messages[0].location = {
                            latitude,
                            longitude
                        };
                    }
                    // Add text or image specific fields
                    else if (['image', 'document', 'audio', 'video'].includes(message?.type) && storedMessage.attachments.length > 0) {
                        const att = storedMessage.attachments[0];
                        webhookPayload.messages[0][message.type] = {
                            fileurl: att.fileUrl,
                            filesize: att.fileSize,
                            meta: att.meta,
                            caption: message.content || '',
                            mime_type: getMimeType(att.fileName) || att.fileType,
                            filename: att.fileName
                        };
                    } else {
                        webhookPayload.messages[0].text = message?.content || '';
                    }
                    await webhookService.forwardEvent(clientId, 'message:visitor', webhookPayload);
                }
            }

            else if (event === 'typing_message') {
                logger.info(`[AgentWorker] Customer typing: ${payload.isTyping} | Interaction: ${interactionId}`);

                // Emit to agents in the room
                if (io) {
                    io.to(interactionId).emit('customer:typing', {
                        interactionId,
                        isTyping: payload.isTyping
                    });
                }

                // Forward to External Webhook (Requirement 4: Visitor Typing)
                // Filter: Only if Bot is NOT active
                // Need to fetch botActive status first since payload may not have it
                const interaction = await prisma.interaction.findUnique({
                    where: { interactionId: interactionId || sessionId },
                    select: { name: true, email: true, visitorId: true, botActive: true }
                });

                if (interaction && !interaction.botActive) {
                    const webhookService = getWebhookDeliveryService(logger);

                    // Fetch visitor details if not present in payload (typing events might be lightweight)
                    let visitorName = visitor?.name || 'Visitor';
                    let visitorEmail = visitor?.email || 'visitor@email.com';
                    let visitorId = visitor?.id || sessionId;

                    if (interaction) {
                        visitorName = interaction.name || visitorName;
                        visitorEmail = interaction.email || visitorEmail;
                        visitorId = visitorId || interaction.visitorId;
                    }

                    // Construct standard payload
                    const visitorTypingPayload = {
                        channel_id: clientId, // Use clientId
                        interaction_id: interactionId, // New field, use interactionId since we have it
                        messages: [{
                            is_bot: false,
                            from: {
                                id: visitorId,
                                name: visitorName,
                                username: visitorEmail
                            },
                            type: 'typing',
                            timestamp: Math.floor(Date.now() / 1000),
                            is_typing: payload.isTyping
                        }]
                    };

                    await webhookService.forwardEvent(clientId, 'typing:visitor', visitorTypingPayload);
                }
            }

            else if (event === 'read_message') {
                logger.info(`[AgentWorker] Message read: ${messageId}`);

                await prisma.message.updateMany({
                    where: { messageId },
                    data: { flagRead: 1 }
                });

                // Emit 'read' status to agent via socket
                io.to(interactionId).emit('message:status', {
                    interactionId,
                    messageId,
                    status: 'read'
                });
                logger.info({ interactionId, messageId }, '[Status] Emitted read status');

                // Forward to External Webhook
                const interaction = await prisma.interaction.findUnique({
                    where: { interactionId: interactionId || sessionId },
                    select: { name: true, email: true, visitorId: true, botActive: true }
                });

                if (interaction && !interaction.botActive) {
                    const webhookService = getWebhookDeliveryService(logger);

                    let visitorName = visitor?.name || interaction.name || 'Visitor';
                    let visitorEmail = visitor?.email || interaction.email || 'visitor@email.com';
                    let visitorId = visitor?.id || interaction.visitorId || sessionId;

                    const visitorReadPayload = {
                        channel_id: clientId,
                        interaction_id: interactionId,
                        messages: [{
                            id: messageId,
                            is_bot: false,
                            from: {
                                id: visitorId,
                                name: visitorName,
                                username: visitorEmail
                            },
                            type: 'read',
                            timestamp: Math.floor(Date.now() / 1000)
                        }]
                    };

                    await webhookService.forwardEvent(clientId, 'message:read', visitorReadPayload);
                }
            }

            else if (event === 'message_delivered') {
                const { tempId } = payload;
                logger.info(`[AgentWorker] Message delivered: ${messageId}`);

                // Emit 'delivered' status to agent via socket
                io.to(interactionId).emit('message:status', {
                    interactionId,
                    messageId,
                    tempId,
                    status: 'delivered'
                });
                logger.info({ interactionId, messageId, tempId }, '[Status] Emitted delivered status');
            }

            else if (event === 'chat_closed') {
                logger.info(`[AgentWorker] Chat closed with rating: ${payload.rating}`);

                await prisma.interaction.updateMany({
                    where: { interactionId },
                    data: {
                        statusChat: 'closed',
                        flagEnd: 'Y'
                    }
                });

                // Forward to External Webhook (Requirement 5: Chat Closed from Visitor)
                // Only if Bot is NOT active
                if (clientId) {
                    const interactionForClose = await prisma.interaction.findUnique({
                        where: { interactionId },
                        select: { botActive: true }
                    });

                    if (interactionForClose && !interactionForClose.botActive) {
                        const webhookService = getWebhookDeliveryService(logger);
                        await webhookService.forwardEvent(clientId, 'chat:closed', {
                            channel_id: interactionId,
                            closed_by: 'visitor',
                            timestamp: Math.floor(Date.now() / 1000)
                        });
                    }
                }
            }

            const duration = Date.now() - startTime;
            logger.info(`[AgentWorker] Completed Job:${job.id} | Duration:${duration}ms`);
            return { success: true };

        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error({
                jobId: job.id,
                event,
                error: error.message,
                duration
            }, `[AgentWorker] Job failed`);
            throw error;
        }
    }, {
        connection: bullMqConnection,
        ...bullMqWorkerPresets.io
    });

    worker.on('failed', async (job, error) => {
        if (!job) {
            logger.error({ error: error.message }, '[OutgoingWorker] Stalled job failed (no job context)');
            return;
        }

        if (job.attemptsMade >= job.opts.attempts) {
            await eventDlqQueue.add('failed-outgoing-event', {
                jobId: job.id,
                queueName: job.queueName,
                originalJob: job.data,
                error: error.message,
                stackTrace: error.stack,
                attempts: job.attemptsMade,
                failedAt: new Date().toISOString()
            });
            logger.error({ jobId: job.id }, '[OutgoingWorker] Job exhausted retries → moved to DLQ');
        }
    });

    worker.on('error', (err) => {
        logger.error({ err }, '[OutgoingWorker] Worker error');
    });

    return worker;
}
