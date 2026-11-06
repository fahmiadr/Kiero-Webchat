/**
 * Socket.IO Plugin for Widget Backend
 *
 * Uses the Fastify Redis connection directly as pubClient to avoid
 * unnecessary duplicate connections. Only the subClient is duplicated
 * (required by the Redis adapter to avoid blocking on SUBSCRIBE).
 */
import fp from 'fastify-plugin';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { setupSocketHandlers } from '../socket/handlers.js';
import { createClientValidationMiddleware } from '../middleware/clientValidation.js';

async function socketPlugin(fastify) {
    const io = new Server(fastify.server, {
        cors: {
            // Permissive at transport layer — tenant origin validation
            // is handled by createClientValidationMiddleware
            origin: true,
            methods: ['GET', 'POST']
        },
        transports: ['websocket', 'polling'],
        pingInterval: 25000,
        pingTimeout: 20000
    });

    // Reuse fastify.redis as pubClient (no duplicate needed)
    // Only duplicate for subClient (SUBSCRIBE blocks the connection)
    const subClient = fastify.redis.duplicate();
    io.adapter(createAdapter(fastify.redis, subClient));

    // Security: Client validation via agent-backend queue (origin check + rate limit)
    io.use(createClientValidationMiddleware(fastify));

    setupSocketHandlers(io, fastify);

    fastify.decorate('io', io);

    fastify.addHook('onClose', async () => {
        io.close();
        await subClient.quit();
        fastify.log.info('[Socket] Server and adapter closed');
    });
}

export default fp(socketPlugin, {
    name: 'socket',
    dependencies: ['redis']
});
