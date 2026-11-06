/**
 * Socket.IO Plugin for Agent Backend
 * 
 * Initializes Socket.IO server and attaches to Fastify.
 * Delegates event handling to socket/handlers.js
 */
import fp from 'fastify-plugin';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { setupSocketHandlers } from '../socket/handlers.js';
import { config } from '../config/index.js';

async function socketPlugin(fastify) {
    // Parse allowed origins from config (supports comma-separated list)
    const allowedOrigins = config.frontendUrl
        ? config.frontendUrl.split(',').map(o => o.trim())
        : ['*'];

    const io = new Server(fastify.server, {
        cors: {
            origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
            methods: ['GET', 'POST']
        },
        transports: ['websocket', 'polling'],
        pingInterval: 25000,
        pingTimeout: 20000,
        perMessageDeflate: {
            threshold: 1024 // Only messagess > 1KB
        }
    });

    // Configure Redis Adapter for horizontal scaling and external worker emission
    // BEST PRACTICE: Reuse the existing fastify.redis connection for pubClient
    const pubClient = fastify.redis;
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));

    fastify.decorate('io', io);

    // Delegate event handling to handlers.js
    setupSocketHandlers(io, fastify);

    fastify.addHook('onClose', async () => {
        io.close();
        subClient.quit(); // Only quit the duplicate, let fastify handle the pubClient
        fastify.log.info('[Socket] Server and adapter closed');
    });
}

export default fp(socketPlugin, {
    name: 'socket'
});
