/**
 * Health Check Routes for Agent Backend
 * 
 * Provides health and readiness endpoints for monitoring.
 */

export default async function healthRoutes(fastify) {
    // Basic health check
    fastify.get('/', async () => {
        return {
            status: 'ok',
            service: 'agent-backend',
            timestamp: new Date().toISOString()
        };
    });

    // Readiness check - verifies all dependencies
    fastify.get('/ready', async (request, reply) => {
        const checks = {
            database: false,
            redis: false,
            socketIO: false
        };

        try {
            // Check Database (Prisma)
            await fastify.prisma.$queryRaw`SELECT 1`;
            checks.database = true;

            // Check Redis
            if (fastify.redis?.status === 'ready') {
                checks.redis = true;
            }

            // Check Socket.IO
            checks.socketIO = fastify.io?.engine?.clientsCount >= 0;

            const allHealthy = Object.values(checks).every(Boolean);

            return reply.status(allHealthy ? 200 : 503).send({
                status: allHealthy ? 'ready' : 'not ready',
                checks
            });

        } catch (error) {
            request.log.error({ err: error }, 'Health check failed');
            return reply.status(503).send({
                status: 'not ready',
                checks,
                error: error.message
            });
        }
    });

    // Metrics endpoint
    fastify.get('/metrics', async () => {
        return {
            connections: fastify.io?.engine?.clientsCount || 0,
            uptime: process.uptime(),
            memory: process.memoryUsage()
        };
    });
}
