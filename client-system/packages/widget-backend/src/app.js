import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/index.js';
import crypto from 'crypto';

export async function buildApp() {
    // Revert to config object to Fix Crash
    // But keep the clean formatting options
    const app = Fastify({
        logger: {
            level: config.logLevel,
            transport: config.env === 'development'
                ? {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        ignore: 'pid,hostname', // Clean logs
                        translateTime: 'HH:MM:ss Z',
                        messageFormat: '{msg}'
                    }
                }
                : undefined
        },
        trustProxy: true,
        genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID()
    });

    // Security plugins
    await app.register(helmet, {
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: { policy: "cross-origin" }
    });

    // CORS — Widget is embeddable on any customer domain.
    // Origin validation is handled per-request (socket middleware + route hooks),
    // not at CORS layer, because preflight (OPTIONS) cannot carry clientId.
    await app.register(cors, {
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Id']
    });

    // Rate limiting (HTTP routes)
    await app.register(rateLimit, {
        max: 100,
        timeWindow: '1 minute',
        keyGenerator: (req) => req.ip,
        allowList: (req) => req.url?.startsWith('/health'),
        errorResponseBuilder: (req, context) => ({
            success: false,
            error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Terlalu banyak permintaan. Silakan coba lagi nanti.',
                retryAfter: Math.ceil(context.ttl / 1000)
            }
        })
    });

    // Custom plugins (will be created next)
    await app.register(import('./plugins/redis.js'));
    await app.register(import('./plugins/socket.js'));

    // =========================================================================
    // API Routes — Grouped by security zone
    // =========================================================================

    // Zone 1: Widget-facing routes (protected by clientId validation)
    await app.register(async (protectedCtx) => {
        const { createHttpClientValidation } = await import('./middleware/httpClientValidation.js');
        protectedCtx.addHook('onRequest', createHttpClientValidation(app));

        await protectedCtx.register(import('./routes/upload.js'), { prefix: '/api/upload' });
        await protectedCtx.register(import('./routes/media.js'), { prefix: '/api/media' });
        await protectedCtx.register(import('./routes/history.js'), { prefix: '/api/widget' });
        await protectedCtx.register(import('./routes/error.js'), { prefix: '/api' });
    });

    // Zone 2: Internal routes (protected by HMAC signature from agent-backend)
    await app.register(async (internalCtx) => {
        const { createHmacValidation } = await import('./middleware/hmacValidation.js');
        internalCtx.addHook('onRequest', createHmacValidation(app));

        await internalCtx.register(import('./routes/webhook.js'), { prefix: '/api/webhook' });
    });

    // Zone 3: Public routes (no auth required)
    await app.register(import('./routes/health.js'), { prefix: '/health' });

    // =========================================================================
    // START BullMQ Workers (after plugins are ready)
    // =========================================================================
    const { startIncomingWorker } = await import('./queues/incomingWorker.js');
    const { startWebhookWorker } = await import('./queues/webhookWorker.js');

    const incomingWorker = startIncomingWorker(app);
    const webhookWorker = startWebhookWorker(app.log);

    // Import queues for graceful shutdown
    const { incomingEventQueue, incomingDlqQueue, outgoingEventQueue, webhookQueue, webhookDlqQueue } = await import('./queues/queues.js');
    const { getAgentBroker } = await import('./services/agentBroker.js');

    // Lazy-init broker (creates response worker)
    const agentBroker = getAgentBroker(app.log);

    // =========================================================================
    // GRACEFUL SHUTDOWN — close all BullMQ resources
    // =========================================================================
    app.addHook('onClose', async () => {
        app.log.info('[Shutdown] Closing BullMQ workers and queues...');

        // Close workers first (stop processing)
        await Promise.allSettled([
            incomingWorker.close(),
            webhookWorker.close(),
            agentBroker.close()
        ]);

        // Close queues (flush pending)
        await Promise.allSettled([
            incomingEventQueue.close(),
            incomingDlqQueue.close(),
            outgoingEventQueue.close(),
            webhookQueue.close(),
            webhookDlqQueue.close()
        ]);

        app.log.info('[Shutdown] BullMQ resources closed');
    });

    // Global error handler
    app.setErrorHandler((error, request, reply) => {
        request.log.error({ err: error }, 'Request error');

        const statusCode = error.statusCode || 500;
        const response = {
            success: false,
            error: {
                code: error.code || 'INTERNAL_ERROR',
                message: statusCode === 500 ? 'Internal server error' : error.message
            }
        };

        reply.status(statusCode).send(response);
    });

    return app;
}
