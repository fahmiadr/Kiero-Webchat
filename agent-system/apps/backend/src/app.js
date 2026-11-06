/**
 * Fastify Application Builder
 * 
 * Creates and configures the Fastify application instance.
 * Separates app configuration from server startup.
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import { config } from './config/index.js';
import prisma from './config/prismaClient.js';

// Routes
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import webhookRoutes from './routes/webhook.js';
import healthRoutes from './routes/health.js';
import uploadRoutes from './routes/upload.js';

import widgetClientRoutes from './routes/widgetClient.js';
import auditLogRoutes from './routes/auditLogs.js';

export async function buildApp() {
    const app = Fastify({
        logger: {
            level: config.logLevel,
            transport: config.env === 'development'
                ? {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        ignore: 'pid,hostname',
                        translateTime: 'HH:MM:ss Z'
                    }
                }
                : undefined
        },
    });

    // Decorate Fastify with Prisma for route access
    app.decorate('prisma', prisma);

    // Graceful shutdown
    app.addHook('onClose', async () => {
        await prisma.$disconnect();
        app.log.info('[Prisma] Disconnected');
    });

    // Security plugins
    await app.register(helmet, {
        global: true,
        contentSecurityPolicy: false, // CSP is complex for existing apps, keeping it disabled or minimal is safer for refactoring
        crossOriginResourcePolicy: { policy: 'cross-origin' }
    });

    // Redis Plugin (Must be first for rate-limit)
    await app.register(import('./plugins/redis.js'));

    // Rate Limiting (Global)
    await app.register(rateLimit, {
        global: true,
        max: 300, // 300 req/min globally
        timeWindow: '1 minute',
        // redis: app.redis, // We will connect redis in plugins/redis.js, need to ensure order or use a connection string.
        // Simple Redis config for rate-limit if usage is standard:
        redis: app.redis,
        addHeaders: {
            'x-ratelimit-limit': true,
            'x-ratelimit-remaining': true,
            'x-ratelimit-reset': true,
            'retry-after': true
        },
        allowList: (req) => {
            // Check if IP is in allowList
            // Handle X-Forwarded-For if behind proxy (Fastify handles this if trustProxy is set, but req.ip is safer)
            const clientIp = req.ip;
            return config.security.rateLimits.allowList.includes(clientIp);
        }
    });

    // JWT (Token based authentication)
    await app.register(jwt, {
        secret: config.jwtSecret,
        sign: {
            expiresIn: '15m' // Access Token
        }
    });

    // CORS
    const allowedOrigins = config.frontendUrl
        ? config.frontendUrl.split(',').map(o => o.trim())
        : ['*'];

    await app.register(cors, {
        origin: async (origin) => {
            // 1. Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return true;

            if (config.env === 'development') {
                app.log.info({ origin, allowedOrigins }, '[CORS] Checking Origin');
            }

            // 2. Check Static Allowlist (Configured in .env)
            if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
                return true;
            }

            // 3. Check Dynamic Allowlist (Database)
            try {
                // Check if any active WidgetClient has this origin in their allowedOrigins list
                const client = await prisma.widgetClient.findFirst({
                    where: {
                        active: true,
                        allowedOrigins: {
                            has: origin
                        }
                    },
                    select: { id: true }
                });

                if (client) {
                    return true;
                }
            } catch (error) {
                // Use app.log if available
                app.log.error({ err: error }, '[CORS] Dynamic Check Error');
            }

            // 4. Deny if no match found (False disables CORS)
            // Throwing an error returns 500, returning false just doesn't send headers.
            // Original code sent an error, so we throw to maintain behavior, or we can stricter return false.
            // Returning false is usually safer/cleaner for CORS denial unless we want to explicity error the request.
            throw new Error('Not allowed by CORS');
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true,
        exposedHeaders: ['Content-Range', 'Content-Length', 'Content-Disposition', 'X-Duration']
    });

    // Custom plugins
    // Redis Plugin registered earlier for rate-limit
    await app.register(import('./plugins/socket.js'));
    await app.register(import('./plugins/auth.js'));
    await app.register(import('./plugins/auditLogger.js'));

    // Request Logging Middleware
    await app.register(import('./middlewares/requestLogger.js'));

    // API Routes
    await app.register(authRoutes, { prefix: '/api/auth' });
    await app.register(chatRoutes, { prefix: '/api/chat' });
    await app.register(webhookRoutes, { prefix: '/api/webhook' });
    await app.register(healthRoutes, { prefix: '/health' });
    await app.register(uploadRoutes, { prefix: '/api/upload' });
    await app.register(widgetClientRoutes, { prefix: '/api/widget-clients' });
    await app.register(auditLogRoutes, { prefix: '/api/logs' });
    await app.register(import('./routes/error.js'), { prefix: '/api' });

    // =========================================================================
    // START BullMQ Workers (after plugins are ready)
    // =========================================================================
    const { startOutgoingWorker } = await import('./queues/outgoingWorker.js');
    const { startRequestWorker } = await import('./queues/requestWorker.js');
    const { startWebhookWorker } = await import('./queues/webhookWorker.js');
    const { startBackgroundWorker } = await import('./queues/backgroundWorker.js');
    const { startQueueEventAuditor, stopQueueEventAuditor } = await import('./queues/queueEventAuditor.js');

    const outgoingWorker = startOutgoingWorker(app.log, app.io);
    const requestWorker = startRequestWorker(app.log);
    const webhookWorker = startWebhookWorker(app.log);
    const backgroundWorker = startBackgroundWorker(app.log);
    startQueueEventAuditor(app.log);

    // Import queues for graceful shutdown
    const { outgoingEventQueue, incomingEventQueue, eventDlqQueue, webhookQueue, backgroundTaskQueue, responseQueue } = await import('./queues/eventQueues.js');
    const { sharedRedisClient } = await import('./config/redisClient.js');

    // =========================================================================
    // GRACEFUL SHUTDOWN — close all BullMQ resources and shared Redis
    // =========================================================================
    app.addHook('onClose', async () => {
        app.log.info('[Shutdown] Closing BullMQ workers and queues...');

        // Close workers first (stop processing)
        await Promise.allSettled([
            outgoingWorker.close(),
            requestWorker.close(),
            webhookWorker.close(),
            backgroundWorker.close(),
            stopQueueEventAuditor()
        ]);

        // Close queues (flush pending)
        await Promise.allSettled([
            outgoingEventQueue.close(),
            incomingEventQueue.close(),
            eventDlqQueue.close(),
            webhookQueue.close(),
            backgroundTaskQueue.close(),
            responseQueue.close()
        ]);

        // Close shared Redis client (used by Socket.IO Emitter and redis_expire)
        await sharedRedisClient.quit();

        app.log.info('[Shutdown] BullMQ resources and shared Redis closed');
    });

    // NOTE: Static file serving removed - using /api/upload/download/:category/:filename API instead

    // Global error handler
    app.setErrorHandler((error, request, reply) => {
        request.log.error({ err: error }, 'Request error');

        // Audit system errors
        if (error.statusCode >= 500 || !error.statusCode) {
            app.auditLog?.log({
                level: 'ERROR',
                source: 'system',
                event: 'system:error',
                metadata: {
                    code: error.code || 'INTERNAL_ERROR',
                    message: error.message,
                    url: request.url,
                    method: request.method
                },
                ip: request.ip
            });
        }

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
