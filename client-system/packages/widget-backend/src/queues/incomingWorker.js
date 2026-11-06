/**
 * Incoming Event Worker (Client-System)
 *
 * Processes events received from agent-backend via the incoming-events queue.
 * Routes real-time updates (messages, typing, status) to connected widget sockets.
 *
 * Events: message:receive, typing:agent, message:status, session:updated,
 *         bot:typing, bot:message, system:message, agent:waiting, agent:assigned, chat:closed
 */
import { Worker } from 'bullmq';
import { bullMqConnection, bullMqWorkerPresets } from '../config/index.js';
import { incomingDlqQueue, webhookQueue } from './queues.js';
import { rewriteAttachmentUrls } from '../utils/urlUtils.js';

export function startIncomingWorker(app) {
    const { io, redis, log: logger } = app;

    logger.info('[IncomingWorker] Starting worker for incoming-events');

    const worker = new Worker('incoming-events', async (job) => {
        const { type, payload } = job.data;
        const startTime = Date.now();

        logger.info({ jobId: job.id, type }, '[IncomingWorker] Processing job');

        try {
            switch (type) {
                case 'message:receive': {
                    const { interactionId, clientId, id, tempId, content, type, sender, senderName, agentId, agentRole, timestamp, attachments, meta } = payload;
                    const socketId = await redis.get(`interaction:${interactionId}`);

                    if (socketId) {
                        io.to(socketId).emit('message:receive', {
                            id,
                            tempId, // Pass tempId for optimistic UI
                            content,
                            type,
                            sender,
                            senderName,
                            agentId,
                            agentRole,
                            timestamp: timestamp || new Date().toISOString(),
                            attachments: rewriteAttachmentUrls(attachments),
                            meta
                        });
                        logger.info(`[IncomingWorker] Emitted message:receive to ${socketId}`);

                        // Notify agent-backend that message was delivered to widget
                        // MUST include clientId for Webhook Worker to sign the request
                        await webhookQueue.add('message_delivered', {
                            event: 'message_delivered',
                            clientId, // Used for signature generation
                            interactionId,
                            messageId: id,
                            tempId // For correlation with agent frontend
                        }, { attempts: 3 });
                        logger.info(`[IncomingWorker] Queued delivered callback for ${id}`);
                    } else {
                        logger.warn(`[IncomingWorker] Socket not found for interaction ${interactionId}`);
                    }
                    break;
                }

                case 'typing:agent': {
                    const { interactionId, isTyping, agentName, agentId, agentRole } = payload;
                    const socketId = await redis.get(`interaction:${interactionId}`);

                    if (socketId) {
                        io.to(socketId).emit('typing:agent', { isTyping, agentName, agentId, agentRole });
                    }
                    break;
                }

                case 'message:status': {
                    const { interactionId, messageId, messageIds, status } = payload;
                    const socketId = await redis.get(`interaction:${interactionId}`);

                    if (socketId) {
                        // Support both single messageId and batch messageIds
                        if (messageIds && Array.isArray(messageIds)) {
                            // Batch update - emit for each message
                            messageIds.forEach(id => {
                                io.to(socketId).emit('message:status', { messageId: id, status });
                            });
                            logger.info(`[IncomingWorker] Batch status update: ${messageIds.length} messages -> ${status}`);
                        } else if (messageId) {
                            // Single update
                            io.to(socketId).emit('message:status', { messageId, status });
                        }
                    }
                    break;
                }

                case 'session:updated': {
                    const { sessionId, interactionId, customerId, agentHandle, connectionType, botInfo } = payload;

                    // Update session data in Redis
                    const session = await redis.get(`session:${sessionId}`);
                    if (session) {
                        const parsed = JSON.parse(session);
                        parsed.interactionId = interactionId;
                        parsed.customerId = customerId;
                        parsed.agentHandle = agentHandle;
                        parsed.connectionType = connectionType;
                        parsed.botInfo = botInfo;

                        // Preserve the existing TTL set during session creation (per-client)
                        const remainingTtl = await redis.ttl(`session:${sessionId}`);
                        if (remainingTtl <= 0) {
                            logger.warn(`[IncomingWorker] Session ${sessionId} already expired or has no TTL. Skipping session update.`);
                            return;
                        }

                        await redis.setex(`session:${sessionId}`, remainingTtl, JSON.stringify(parsed));

                        // Map interaction to socket
                        const socketId = await redis.get(`sessionSocket:${sessionId}`);
                        if (socketId) {
                            await redis.setex(`interaction:${interactionId}`, remainingTtl, socketId);

                            io.to(socketId).emit('session:updated', {
                                interactionId,
                                agentHandle,
                                connectionType,
                                botInfo
                            });
                            logger.info(`[IncomingWorker] Synced session with ${connectionType === 'bot' ? 'bot' : 'agent'} for ${interactionId}`);
                        }
                    }
                    break;
                }

                case 'session:invalid': {
                    const { sessionId, interactionId, reason } = payload;
                    logger.warn(`[IncomingWorker] Session invalid: ${sessionId} - ${reason}`);

                    // Find socket by sessionId first, then try interactionId
                    let socketId = await redis.get(`sessionSocket:${sessionId}`);
                    if (!socketId && interactionId) {
                        socketId = await redis.get(`interaction:${interactionId}`);
                    }

                    if (socketId) {
                        // Emit session:invalid to client
                        io.to(socketId).emit('session:invalid', { reason });
                        logger.info(`[IncomingWorker] Emitted session:invalid to ${socketId}`);
                    }

                    // Clean up Redis keys
                    if (sessionId) {
                        await redis.del(`session:${sessionId}`);
                        await redis.del(`sessionSocket:${sessionId}`);
                    }
                    if (interactionId) {
                        await redis.del(`interaction:${interactionId}`);
                    }
                    break;
                }

                // =====================================================
                // BOT SERVICE EVENTS
                // =====================================================
                case 'bot:typing': {
                    const { interactionId, isTyping, forceRoom } = payload;

                    // Priority: forceRoom (sessionId) -> interactionId
                    let socketId = null;
                    if (forceRoom) {
                        socketId = await redis.get(`sessionSocket:${forceRoom}`);
                    }

                    if (!socketId) {
                        socketId = await redis.get(`interaction:${interactionId}`);
                    }

                    if (socketId) {
                        io.to(socketId).emit('typing:agent', {
                            isTyping,
                            isBot: true
                        });
                        logger.info(`[IncomingWorker] Bot typing: ${isTyping} (Target: ${forceRoom || interactionId})`);
                    }
                    break;
                }

                case 'bot:message': {
                    const { interactionId, messageId, content, sender, senderName, timestamp } = payload;
                    const socketId = await redis.get(`interaction:${interactionId}`);

                    if (socketId) {
                        io.to(socketId).emit('message:receive', {
                            id: messageId,
                            content,
                            type: 'text',
                            direction: 'incoming',
                            sender: sender || 'bot',
                            senderName, // Pass dynamic bot name
                            isBot: true,
                            timestamp: timestamp || new Date().toISOString()
                        });
                        logger.info(`[IncomingWorker] Bot message sent to ${socketId}`);
                    }
                    break;
                }

                case 'system:message': {
                    const { interactionId, messageId, content, eventType, timestamp, forceRoom } = payload;

                    // Priority: forceRoom (sessionId) -> interactionId
                    let socketId = null;
                    if (forceRoom) {
                        socketId = await redis.get(`sessionSocket:${forceRoom}`);
                    }

                    if (!socketId) {
                        socketId = await redis.get(`interaction:${interactionId}`);
                    }

                    if (socketId) {
                        io.to(socketId).emit('message:receive', {
                            id: messageId,
                            content,
                            type: 'system',
                            direction: 'system',
                            sender: 'system',
                            eventType,
                            timestamp: timestamp || new Date().toISOString()
                        });
                        logger.info(`[IncomingWorker] System message (${eventType}) sent to ${socketId} (Target: ${forceRoom || interactionId})`);
                    }
                    break;
                }

                case 'agent:waiting': {
                    const { interactionId, queuePosition } = payload;
                    const socketId = await redis.get(`interaction:${interactionId}`);

                    if (socketId) {
                        io.to(socketId).emit('agent:waiting', {
                            queuePosition,
                            message: 'You are in queue. An agent will be with you shortly.'
                        });
                        logger.info(`[IncomingWorker] User in queue: position ${queuePosition}`);
                    }
                    break;
                }

                case 'agent:assigned': {
                    const { interactionId, agentId, agentName, agentRole, message } = payload;
                    const socketId = await redis.get(`interaction:${interactionId}`);

                    if (socketId) {
                        io.to(socketId).emit('agent:assigned', {
                            agentId,
                            agentName,
                            agentRole,
                            message: message || 'An agent has joined the chat.'
                        });
                        logger.info(`[IncomingWorker] Agent ${agentId} assigned to ${interactionId}`);
                    }
                    break;
                }

                case 'chat:closed': {
                    const { interactionId, closedByName, closedRole } = payload;
                    const socketId = await redis.get(`interaction:${interactionId}`);

                    if (socketId) {
                        io.to(socketId).emit('chat:closed', {
                            interactionId,
                            closedByName,
                            closedRole,
                            message: `Chat closed by ${closedByName || 'agent'}`
                        });
                        logger.info(`[IncomingWorker] Chat closed for ${interactionId}`);
                    }
                    break;
                }

                default:
                    logger.warn(`[IncomingWorker] Unknown event type: ${type}`);
            }

            logger.info({ jobId: job.id, duration: Date.now() - startTime }, '[IncomingWorker] Job completed');

        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error({
                jobId: job.id,
                type,
                error: error.message,
                duration
            }, '[IncomingWorker] Job processing failed');

            throw error; // Trigger retry
        }
    }, {
        connection: bullMqConnection,
        ...bullMqWorkerPresets.standard
    });

    worker.on('failed', async (job, error) => {
        // Guard: job is null when stalled (worker died mid-processing)
        if (!job) {
            logger.error({ error: error.message }, '[IncomingWorker] Stalled job failed (no job context)');
            return;
        }

        if (job.attemptsMade >= job.opts.attempts) {
            await incomingDlqQueue.add('failed-incoming-event', {
                jobId: job.id,
                queueName: job.queueName,
                originalJob: job.data,
                error: error.message,
                stackTrace: error.stack,
                attempts: job.attemptsMade,
                failedAt: new Date().toISOString()
            });
            logger.error({ jobId: job.id }, '[IncomingWorker] Job exhausted retries → moved to DLQ');
        }
    });

    worker.on('error', (err) => {
        logger.error({ err }, '[IncomingWorker] Worker error');
    });

    return worker;
}
