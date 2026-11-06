export default async function healthRoutes(fastify) {
    fastify.get('/', async () => {
        return {
            status: 'ok',
            timestamp: new Date().toISOString()
        };
    });

    fastify.get('/ready', async (request, reply) => {
        const checks = {
            redis: false,
            socketIO: false
        };

        try {
            if (fastify.redis.status === 'ready') {
                checks.redis = true;
            }

            checks.socketIO = fastify.io.engine.clientsCount >= 0;

            const allHealthy = Object.values(checks).every(Boolean);

            return reply.status(allHealthy ? 200 : 503).send({
                status: allHealthy ? 'ready' : 'not ready',
                checks
            });

        } catch (error) {
            return reply.status(503).send({
                status: 'not ready',
                checks,
                error: error.message
            });
        }
    });

    fastify.get('/metrics', async () => {
        return {
            connections: fastify.io.engine.clientsCount,
            uptime: process.uptime()
        };
    });
}
