import { webhookSchema } from '../validators/schemas.js';

export default async function webhookRoutes(fastify) {
    const { io, redis } = fastify;

    fastify.post('/message', async (request, reply) => {
        const { interaction_id, message_id, content, type, is_bot, attachments } = request.body;
        fastify.log.info(`[FLOW:WEBHOOK->BACKEND] Recv:POST | Endpoint:/message | MsgId:${message_id}`);

        const socketId = await redis.get(`interaction:${interaction_id}`);

        if (!socketId) {
            fastify.log.warn(`[FLOW:FAIL] socketId not found | Interaction:${interaction_id}`);
            return reply.status(404).send({
                success: false,
                error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' }
            });
        }

        io.to(socketId).emit('message:receive', {
            id: message_id,
            content,
            type,
            direction: 'incoming',
            isBot: is_bot || false,
            timestamp: new Date().toISOString(),
            attachments
        });
        fastify.log.info(`[FLOW:BACKEND->CLIENT] Emit:message:receive | Endpoint:/message | Socket:${socketId}`);

        return { success: true };
    });

    fastify.post('/typing', async (request, reply) => {
        const { interaction_id, is_typing } = request.body;

        const socketId = await redis.get(`interaction:${interaction_id}`);
        if (socketId) {
            io.to(socketId).emit('typing:agent', { isTyping: is_typing });
        }

        return { success: true };
    });

    fastify.post('/status', async (request, reply) => {
        const { interaction_id, message_id, status } = request.body;
        fastify.log.info(`[FLOW:WEBHOOK->BACKEND] Recv:POST | Endpoint:/status | MsgId:${message_id} | Status:${status}`);

        const socketId = await redis.get(`interaction:${interaction_id}`);
        if (socketId) {
            io.to(socketId).emit('message:status', { messageId: message_id, status });
            fastify.log.info(`[FLOW:BACKEND->CLIENT] Emit:message:status | MsgId:${message_id} | Socket:${socketId}`);
        }

        return { success: true };
    });

    fastify.post('/session', async (request, reply) => {
        const { session_id, interaction_id, customer_id, agent_handle } = request.body;
        fastify.log.info(`[FLOW:WEBHOOK->BACKEND] Recv:POST | Endpoint:/session | Session:${session_id}`);

        const session = await redis.get(`session:${session_id}`);
        if (session) {
            const parsed = JSON.parse(session);
            parsed.interactionId = interaction_id;
            parsed.customerId = customer_id;
            parsed.agentHandle = agent_handle;

            // Preserve the existing TTL set during session creation (per-client)
            const remainingTtl = await redis.ttl(`session:${session_id}`);
            if (remainingTtl <= 0) {
                fastify.log.warn(`[Webhook] Session ${session_id} already expired or has no TTL. Skipping session update.`);
                return { success: true };
            }

            await redis.setex(`session:${session_id}`, remainingTtl, JSON.stringify(parsed));

            const socketId = await redis.get(`sessionSocket:${session_id}`);

            if (socketId) {
                await redis.setex(`interaction:${interaction_id}`, remainingTtl, socketId);

                fastify.io.to(socketId).emit('session:updated', {
                    interactionId: interaction_id,
                    agentHandle: agent_handle
                });
                fastify.log.info(`[FLOW:BACKEND->CLIENT] Emit:session:updated | Interaction:${interaction_id}`);
            }
        }

        return { success: true };
    });
}
