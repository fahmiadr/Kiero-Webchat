/**
 * Socket Rate Limiter Middleware (Production-Ready)
 *
 * Provides distributed rate limiting for Socket.IO events using Redis:
 * - Per socket rate limiting (messages per time window)
 * - Per interaction rate limiting (messages per hour)
 * - Per IP rate limiting
 *
 * Uses Redis for distributed rate limiting across multiple instances.
 */

/**
 * Extract real client IP from socket handshake headers.
 * Behind reverse proxy (Nginx, etc.), `socket.handshake.address` returns the proxy IP.
 * We check `X-Forwarded-For` and `X-Real-IP` headers for the real client IP.
 *
 * @param {Object} socket - Socket.IO socket instance
 * @returns {string} Real client IP address
 */
function getClientIp(socket) {
    const headers = socket.handshake.headers || {};

    // X-Forwarded-For may contain comma-separated list: "client, proxy1, proxy2"
    const xForwardedFor = headers['x-forwarded-for'];
    if (xForwardedFor) {
        const firstIp = xForwardedFor.split(',')[0].trim();
        if (firstIp) return firstIp;
    }

    // Fallback to X-Real-IP (set by Nginx proxy_set_header)
    const xRealIp = headers['x-real-ip'];
    if (xRealIp) return xRealIp.trim();

    // Last resort: socket.handshake.address (may be proxy IP)
    return socket.handshake.address;
}

/**
 * Rate limit configuration
 */
const DEFAULT_CONFIG = {
    socket: {
        maxMessages: 30,
        windowMs: 10000,
    },
    interaction: {
        maxMessages: 100,
        windowMs: 3600000,
    },
    ip: {
        maxConnections: 100,
        maxMessages: 50,
        windowMs: 60000,
    }
};

/**
 * Redis-based rate limit store for distributed rate limiting
 */
class RedisRateLimitStore {
    constructor(redis, logger) {
        this.redis = redis;
        this.logger = logger;
        this.keyPrefix = 'ratelimit:';
    }

    /**
     * Generate Redis key
     */
    key(type, id) {
        return `${this.keyPrefix}${type}:${id}`;
    }

    /**
     * Check and increment counter using Redis INCR + EXPIRE
     */
    async checkLimit(type, id, maxCount, windowMs) {
        const redisKey = this.key(type, id);
        const windowSec = Math.ceil(windowMs / 1000);

        try {
            // Use Redis transaction for atomic increment + expire
            const multi = this.redis.multi();
            multi.incr(redisKey);
            multi.pttl(redisKey);
            const results = await multi.exec();

            const count = results[0][1];
            const ttl = results[1][1];

            // Set expiry only on first request (when TTL is -1)
            if (ttl === -1) {
                await this.redis.expire(redisKey, windowSec);
            }

            if (count > maxCount) {
                const retryAfter = ttl > 0 ? Math.ceil(ttl / 1000) : windowSec;
                return {
                    allowed: false,
                    retryAfter,
                    count,
                    reason: this.getReasonMessage(type)
                };
            }

            return {
                allowed: true,
                remaining: maxCount - count,
                count
            };
        } catch (error) {
            this.logger?.error({ error, type, id }, '[RateLimit] Redis error, allowing request');
            return { allowed: true, remaining: maxCount };
        }
    }

    /**
     * Get user-friendly reason message
     */
    getReasonMessage(type) {
        switch (type) {
            case 'socket':
                return 'Pelan-pelan ya 😊 Pesan kamu terlalu cepat, tunggu sebentar.';
            case 'interaction':
                return 'Batas pesan untuk sesi ini sudah tercapai. Silakan tunggu beberapa saat.';
            case 'ip':
                return 'Terlalu banyak aktivitas. Silakan tunggu sebentar sebelum mengirim lagi.';
            case 'ip:conn':
                return 'Terlalu banyak koneksi. Silakan tutup tab lain dan coba lagi.';
            default:
                return 'Silakan tunggu sebentar sebelum mencoba lagi.';
        }
    }

    /**
     * Check socket message rate
     */
    async checkSocket(socketId, config = DEFAULT_CONFIG.socket) {
        return this.checkLimit('socket', socketId, config.maxMessages, config.windowMs);
    }

    /**
     * Check interaction message rate
     */
    async checkInteraction(interactionId, config = DEFAULT_CONFIG.interaction) {
        return this.checkLimit('interaction', interactionId, config.maxMessages, config.windowMs);
    }

    /**
     * Check IP message rate
     */
    async checkIp(ip, config = DEFAULT_CONFIG.ip) {
        return this.checkLimit('ip', ip, config.maxMessages, config.windowMs);
    }

    /**
     * Track IP connection count using Redis Set
     */
    async trackConnection(ip, socketId, maxConnections = DEFAULT_CONFIG.ip.maxConnections) {
        const setKey = this.key('ip:conn', ip);

        try {
            // Add socket to IP's connection set
            await this.redis.sadd(setKey, socketId);
            await this.redis.expire(setKey, 3600); // 1 hour TTL

            // Check connection count
            const count = await this.redis.scard(setKey);

            if (count > maxConnections) {
                return {
                    allowed: false,
                    reason: this.getReasonMessage('ip:conn'),
                    count
                };
            }

            return { allowed: true, count };
        } catch (error) {
            this.logger?.error({ error, ip }, '[RateLimit] Redis error tracking connection');
            return { allowed: true };
        }
    }

    /**
     * Remove connection from tracking
     */
    async removeConnection(ip, socketId) {
        const setKey = this.key('ip:conn', ip);
        try {
            await this.redis.srem(setKey, socketId);
        } catch (error) {
            this.logger?.error({ error, ip, socketId }, '[RateLimit] Redis error removing connection');
        }
    }

    /**
     * Remove socket tracking (cleanup rate limit key)
     */
    async removeSocket(socketId) {
        try {
            await this.redis.del(this.key('socket', socketId));
        } catch (error) {
            this.logger?.error({ error, socketId }, '[RateLimit] Redis error removing socket');
        }
    }
}

/**
 * Create rate limiting middleware for socket handlers
 * @param {Object} fastify - Fastify instance with redis and logging
 * @param {Object} customConfig - Optional custom configuration
 */
export function createSocketRateLimiter(fastify, customConfig = {}) {
    const config = { ...DEFAULT_CONFIG, ...customConfig };
    const store = new RedisRateLimitStore(fastify.redis, fastify.log);

    return {
        /**
         * Check rate limit on connection
         */
        onConnection: (socket) => {
            const ip = getClientIp(socket);

            // Track connection asynchronously (capture promise)
            const trackingPromise = (async () => {
                const result = await store.trackConnection(ip, socket.id, config.ip.maxConnections);

                if (!result.allowed) {
                    fastify.log.warn({ ip, socketId: socket.id, count: result.count }, `[RateLimit] Connection rejected: ${result.reason}`);
                    socket.emit('error', { message: result.reason, code: 'RATE_LIMIT_CONN' });
                    socket.disconnect(true);
                }
            })();

            // Track disconnect for cleanup
            socket.on('disconnect', async () => {
                try {
                    // Start cleanup but ensure tracking finished first (prevent race condition)
                    await trackingPromise;

                    await store.removeConnection(ip, socket.id);
                    await store.removeSocket(socket.id);

                    // fastify.log.debug({ ip, socketId: socket.id }, '[RateLimit] Connection cleaned up');
                } catch (err) {
                    fastify.log.error({ err, ip, socketId: socket.id }, '[RateLimit] Error during cleanup');
                }
            });

            return true; // Allow connection initially, async check will disconnect if needed
        },

        /**
         * Check rate limit for message events
         * @param {Object} socket - Socket instance
         * @param {string} interactionId - Optional interaction ID for per-session limiting
         */
        checkMessage: async (socket, interactionId = null) => {
            const ip = getClientIp(socket);

            // Check socket rate limit
            const socketResult = await store.checkSocket(socket.id, config.socket);
            if (!socketResult.allowed) {
                fastify.log.warn({ socketId: socket.id, count: socketResult.count }, '[RateLimit] Socket limit exceeded');
                return socketResult;
            }

            // Check IP rate limit
            const ipResult = await store.checkIp(ip, config.ip);
            if (!ipResult.allowed) {
                fastify.log.warn({ ip, count: ipResult.count }, '[RateLimit] IP limit exceeded');
                return ipResult;
            }

            // Check interaction rate limit if provided
            if (interactionId) {
                const interactionResult = await store.checkInteraction(interactionId, config.interaction);
                if (!interactionResult.allowed) {
                    fastify.log.warn({ interactionId, count: interactionResult.count }, '[RateLimit] Interaction limit exceeded');
                    return interactionResult;
                }
            }

            return { allowed: true };
        }
    };
}

export { RedisRateLimitStore, DEFAULT_CONFIG, getClientIp };

