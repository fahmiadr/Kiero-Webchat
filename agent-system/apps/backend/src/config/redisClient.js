/**
 * Shared Redis Client for Agent Backend
 *
 * Singleton ioredis instance for non-Fastify contexts (background workers,
 * Socket.IO Emitter). Auto-connects immediately so connection errors surface
 * early instead of failing silently on first use.
 */
import Redis from 'ioredis';
import { Emitter } from '@socket.io/redis-emitter';
import { config } from './index.js';

export const sharedRedisClient = new Redis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryDelayOnFailover: 100,
    reconnectOnError(err) {
        if (err.message.includes('READONLY')) return 2; // Reconnect + retry failed command
        return false;
    }
});

sharedRedisClient.on('error', (err) => console.error('[Redis Shared] Error:', err.message));

// Singleton Socket.IO Emitter for background jobs to broadcast real-time events
export const socketEmitter = new Emitter(sharedRedisClient);
