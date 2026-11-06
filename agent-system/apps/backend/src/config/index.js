import dotenv from 'dotenv';
dotenv.config();

// Helper to enforce env vars presence
const getEnv = (key, required = true) => {
    const value = process.env[key];
    if (required && !value) {
        throw new Error(`FATAL: Missing required environment variable: ${key}`);
    }
    return value;
};

// Parse duration strings (15m, 1h, 7d) to seconds for Redis/BullMQ
export const parseExpiryToSeconds = (expiry) => {
    if (typeof expiry === 'number') return expiry;
    const match = String(expiry).match(/^(\d+)([smhd])$/);
    if (!match) return 3600; // Default 1h
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
        case 's': return value;
        case 'm': return value * 60;
        case 'h': return value * 3600;
        case 'd': return value * 86400;
        default: return value;
    }
};

// Parse Redis URL into host/port for BullMQ
const parseRedisUrl = (url) => {
    try {
        const parsed = new URL(url);
        return {
            host: parsed.hostname || 'localhost',
            port: parseInt(parsed.port, 10) || 6379,
            password: parsed.password || undefined
        };
    } catch {
        return { host: 'localhost', port: 6379 };
    }
};

const redisUrl = getEnv('REDIS_URL');

export const config = {
    env: getEnv('NODE_ENV'),
    port: parseInt(getEnv('PORT'), 10),
    logLevel: getEnv('LOG_LEVEL'),
    databaseUrl: getEnv('DATABASE_URL'),
    redis: {
        url: redisUrl,
        ...parseRedisUrl(redisUrl)
    },
    jwtSecret: getEnv('JWT_SECRET'),
    webhookSecret: getEnv('WEBHOOK_SECRET'),
    encryptionKey: getEnv('ENCRYPTION_KEY'),
    frontendUrl: getEnv('FRONTEND_URL'),
    security: {
        rateLimits: {
            login: {
                max: parseInt(process.env.RATE_LIMIT_LOGIN_MAX || '5', 10),
                window: process.env.RATE_LIMIT_WINDOW || '1 minute'
            },
            refresh: {
                max: parseInt(process.env.RATE_LIMIT_REFRESH_MAX || '20', 10),
                window: process.env.RATE_LIMIT_WINDOW || '1 minute'
            },
            upload: {
                max: parseInt(process.env.RATE_LIMIT_UPLOAD_MAX || '10', 10),
                window: process.env.RATE_LIMIT_WINDOW || '1 minute'
            },
            widget: {
                max: parseInt(process.env.RATE_LIMIT_WIDGET_MAX || '60', 10),
                window: process.env.RATE_LIMIT_WINDOW || '1 minute'
            },
            allowList: (process.env.RATE_LIMIT_ALLOW_LIST || '127.0.0.1').split(',').map(ip => ip.trim())
        },
        tokens: {
            accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
            refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
            refreshExpirySeconds: parseExpiryToSeconds(process.env.JWT_REFRESH_EXPIRY || '7d')
        }
    }
};

/**
 * Failover-safe Redis connection for BullMQ (Queue, Worker, QueueEvents).
 *
 * - maxRetriesPerRequest: null  → Required by BullMQ; prevents ioredis from
 *   throwing after N retries so the worker keeps waiting.
 * - enableReadyCheck: false     → Skips the `INFO` command that may fail on a
 *   read-only replica during failover.
 * - reconnectOnError             → Returns `2` on READONLY errors so ioredis
 *   automatically reconnects AND retries the failed command.
 */
export const bullMqConnection = {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    reconnectOnError(err) {
        if (err.message.includes('READONLY')) return 2; // Reconnect + retry failed command
        return false;
    }
};

/**
 * Centralized BullMQ defaultJobOptions presets.
 *
 * Each queue references a preset by name instead of duplicating inline configs.
 * All presets use exponential backoff by default.
 *
 * | Preset     | Use Case                          | Retries | Retention        |
 * |------------|-----------------------------------|---------|------------------|
 * | standard   | Critical event queues             | 5       | 1h / 1000 jobs   |
 * | transient  | Short-lived request/response      | 3       | Immediate delete |
 * | webhook    | External HTTP delivery            | 10      | 1h / 500 jobs    |
 * | background | Fire-and-forget internal tasks    | 3       | 10m / 200 jobs   |
 * | dlq        | Dead letter queues (inspection)   | —       | 24h / 500 jobs   |
 */
export const bullMqJobPresets = {
    /** Critical event queues — moderate retries, keep history for debugging */
    standard: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: false
    },

    /** Request/response jobs — fast cleanup, minimal retries */
    transient: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 500 },
        removeOnComplete: true,
        removeOnFail: false
    },

    /** External webhook delivery — aggressive retries, moderate retention */
    webhook: {
        attempts: 10,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 3600, count: 500 },
        removeOnFail: false
    },

    /** Background fire-and-forget tasks — short retention */
    background: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 500 },
        removeOnComplete: { age: 600, count: 200 },
        removeOnFail: { age: 3600, count: 100 }
    },

    /** Dead letter queues — long retention for inspection, no retries needed */
    dlq: {
        removeOnComplete: { age: 86400, count: 500 }
    }
};

/**
 * Centralized BullMQ Worker option presets.
 *
 * Each Worker references a preset instead of inline concurrency/lock configs.
 *
 * | Preset     | Use Case                     | Concurrency | lockDuration |
 * |------------|------------------------------|-------------|--------------|
 * | standard   | Event processing (DB ops)    | 5           | 60s          |
 * | io         | HTTP/queue I/O, rate-limited | 10          | 120s         |
 * | background | Lightweight fire-and-forget  | 10          | 30s          |
 */
export const bullMqWorkerPresets = {
    /** Event processing — moderate concurrency, safe lock for DB-heavy jobs */
    standard: {
        concurrency: 5,
        lockDuration: 60000,
        stalledInterval: 30000,
        maxStalledCount: 2
    },

    /** High-throughput I/O workers — HTTP calls, rate-limited */
    io: {
        concurrency: 10,
        lockDuration: 120000,
        stalledInterval: 60000,
        maxStalledCount: 2,
        limiter: { max: 100, duration: 1000 }
    },

    /** Lightweight fire-and-forget tasks */
    background: {
        concurrency: 10,
        lockDuration: 30000,
        stalledInterval: 15000,
        maxStalledCount: 1
    }
};
