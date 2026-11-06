import { SessionService } from '../services/sessionService.js';
import { webhookQueue } from '../queues/queues.js';
import { createSocketRateLimiter } from '../middleware/socketRateLimiter.js';
import crypto from 'crypto';

export function setupSocketHandlers(io, fastify) {
    const rateLimiter = createSocketRateLimiter(fastify);

    io.on('connection', async (socket) => {
        const { clientId } = socket.handshake.query;
        fastify.log.info(`[FLOW:CLIENT->BACKEND] Connection | Client:${clientId} | Socket:${socket.id}`);

        // Instantiate SessionService per-connection with tenant-specific TTL
        // If tenant TTL is not set, SessionService constructor defaults to 86400 (24h)
        const sessionService = new SessionService(fastify.redis, socket.tenant?.sessionTtlSeconds);

        // Check connection rate limit
        if (!rateLimiter.onConnection(socket)) {
            return; // Connection rejected by rate limiter
        }

        // Send validated config back to client
        if (socket.tenant && socket.tenant.theme) {
            socket.emit('config:loaded', { theme: socket.tenant.theme });
        }

        socket.on('chat:start', async (data) => {
            try {
                const { name, email } = data;
                const sessionId = crypto.randomUUID();

                fastify.log.info(`[FLOW:CLIENT->BACKEND] Chat:Start | Socket:${socket.id} | Session:${sessionId}`);

                await sessionService.createSession(sessionId, {
                    clientId,
                    visitorInfo: { name, email }
                });

                await sessionService.mapSocketToSession(socket.id, sessionId);

                await webhookQueue.add('new_chat', {
                    event: 'new_chat',
                    clientId,
                    sessionId,
                    visitor: { name, email },
                    timestamp: new Date().toISOString()
                });
                fastify.log.info(`[FLOW:BACKEND->WORKER] Queue:new_chat | Session:${sessionId}`);

                socket.emit('chat:started', { sessionId });
                fastify.log.info(`[FLOW:BACKEND->CLIENT] Emit:chat:started | Socket:${socket.id} | Session:${sessionId}`);

            } catch (error) {
                fastify.log.error({ err: error }, 'Failed to start chat');
                socket.emit('error', { message: 'Failed to start chat' });
            }
        });

        // Handle reconnection
        socket.on('session:rejoin', async (data) => {
            try {
                const { sessionId } = data;

                fastify.log.info(`[FLOW:CLIENT->BACKEND] Session:Rejoin | Socket:${socket.id} | Session:${sessionId}`);

                const session = await sessionService.getSession(sessionId);

                if (session) {
                    await sessionService.mapSocketToSession(socket.id, sessionId);

                    if (session.interactionId) {
                        await sessionService.mapInteractionToSocket(session.interactionId, socket.id);
                    }

                    socket.emit('session:rejoined', { sessionId, success: true });
                    fastify.log.info(`[FLOW:BACKEND->CLIENT] Emit:session:rejoined | Socket:${socket.id} | Success:true`);
                } else {
                    socket.emit('session:rejoined', { sessionId, success: false });
                    fastify.log.info(`[FLOW:BACKEND->CLIENT] Emit:session:rejoined | Socket:${socket.id} | Success:false`);
                }
            } catch (error) {
                fastify.log.error({ err: error }, 'Failed to rejoin session');
            }
        });

        socket.on('message:send', async (data) => {
            try {
                const { messageId, content, type, attachments = [], meta } = data;
                fastify.log.info(`[FLOW:CLIENT->BACKEND] Msg:Send | Socket:${socket.id} | MsgId:${messageId} | Attachments:${attachments.length} | Meta: ${!!meta}`);

                const sessionId = await fastify.redis.get(`socket:${socket.id}`);

                if (!sessionId) {
                    socket.emit('error', { message: 'Session not found' });
                    return;
                }

                const session = await sessionService.getSession(sessionId);

                if (!session) {
                    socket.emit('error', { message: 'Session not found' });
                    return;
                }

                // Rate limit check (async with Redis)
                const rateLimitResult = await rateLimiter.checkMessage(socket, session.interactionId);
                if (!rateLimitResult.allowed) {
                    fastify.log.warn({ socketId: socket.id, reason: rateLimitResult.reason }, '[RateLimit] Message rejected');
                    socket.emit('message:ack', {
                        messageId,
                        status: 'rate_limited',
                        error: rateLimitResult.reason,
                        retryAfter: rateLimitResult.retryAfter
                    });
                    return;
                }

                await webhookQueue.add('new_message', {
                    event: 'new_message',
                    clientId: session.clientId,
                    sessionId,
                    interactionId: session.interactionId || sessionId,
                    messageId,
                    message: { content, type, flag_to: 'customer', attachments, meta }, // Pass meta
                    timestamp: new Date().toISOString()
                });
                fastify.log.info(`[FLOW:BACKEND->WORKER] Queue:new_message | Session:${sessionId} | MsgId:${messageId}`);

                socket.emit('message:ack', { messageId, status: 'sent' });
                fastify.log.info(`[FLOW:BACKEND->CLIENT] Emit:message:ack | Socket:${socket.id} | MsgId:${messageId}`);

            } catch (error) {
                fastify.log.error({ err: error }, 'Failed to send message');
                socket.emit('message:ack', { messageId: data.messageId, status: 'failed' });
            }
        });

        socket.on('message:typing', async ({ isTyping }) => {
            const sessionId = await fastify.redis.get(`socket:${socket.id}`);

            // Rate limit typing events (use socket-only limit, no interaction limit)
            const rateLimitResult = await rateLimiter.checkMessage(socket);
            if (!rateLimitResult.allowed) {
                return; // Silently drop typing events when rate limited
            }

            fastify.log.info(`[FLOW:CLIENT->BACKEND] Msg:Typing | Socket:${socket.id} | Status:${isTyping}`);

            const session = await sessionService.getSession(sessionId);

            if (session?.interactionId && session?.clientId) {
                webhookQueue.add('typing', {
                    event: 'typing_message',
                    clientId: session.clientId,
                    interactionId: session.interactionId,
                    isTyping
                }, { attempts: 1 });
                fastify.log.info(`[FLOW:BACKEND->WORKER] Queue:typing | Session:${sessionId} | Status:${isTyping}`);
            }
        });

        socket.on('message:read', async ({ messageId }) => {
            const sessionId = await fastify.redis.get(`socket:${socket.id}`);

            fastify.log.info(`[FLOW:CLIENT->BACKEND] Msg:Read | Socket:${socket.id} | MsgId:${messageId}`);

            const session = await sessionService.getSession(sessionId);

            if (session?.interactionId && session?.clientId) {
                await webhookQueue.add('read_message', {
                    event: 'read_message',
                    clientId: session.clientId,
                    interactionId: session.interactionId,
                    messageId
                });
                fastify.log.info(`[FLOW:BACKEND->WORKER] Queue:read_message | Session:${sessionId} | MsgId:${messageId}`);
            }
        });

        socket.on('chat:end', async ({ rating, feedback }) => {
            const sessionId = await fastify.redis.get(`socket:${socket.id}`);

            fastify.log.info(`[FLOW:CLIENT->BACKEND] Chat:End | Socket:${socket.id}`);

            const session = await sessionService.getSession(sessionId);

            if (session) {
                await sessionService.closeSession(sessionId);

                await webhookQueue.add('chat_closed', {
                    event: 'chat_closed',
                    clientId: session.clientId,
                    interactionId: session.interactionId,
                    rating,
                    feedback
                });
                fastify.log.info(`[FLOW:BACKEND->WORKER] Queue:chat_closed | Session:${sessionId}`);
            }
        });

        socket.on('disconnect', async (reason) => {
            fastify.log.info(`[FLOW:CLIENT->BACKEND] Disconnect | Socket:${socket.id} | Reason:${reason}`);
        });
    });
}
