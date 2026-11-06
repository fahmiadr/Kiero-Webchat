/**
 * Redis Plugin for Agent Backend
 * 
 * Provides Redis connection as Fastify decorator.
 * Used by Socket.IO adapter and other services.
 */
import fp from 'fastify-plugin';
import Redis from 'ioredis';
import { config } from '../config/index.js';

async function redisPlugin(fastify) {
    const redis = new Redis(config.redis.url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryDelayOnFailover: 100,
        lazyConnect: true,
        reconnectOnError(err) {
            if (err.message.includes('READONLY')) return 2; // Reconnect + retry failed command
            return false;
        }
    });

    redis.on('connect', () => fastify.log.info('[Redis] Connected'));
    redis.on('error', (err) => fastify.log.error({ err }, '[Redis] Error'));

    await redis.connect();

    fastify.decorate('redis', redis);

    fastify.addHook('onClose', async () => {
        await redis.quit();
        fastify.log.info('[Redis] Disconnected');
    });
}

export default fp(redisPlugin, { name: 'redis' });
