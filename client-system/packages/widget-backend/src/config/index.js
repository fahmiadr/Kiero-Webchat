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

// =============================================================================
// MAIN CONFIGURATION
// Note: Tenant validation is now done via agent-backend message broker
// =============================================================================
export const config = {
  env: getEnv('NODE_ENV'),
  port: parseInt(getEnv('PORT'), 10),
  logLevel: getEnv('LOG_LEVEL'),

  redis: {
    url: redisUrl,
    ...parseRedisUrl(redisUrl)
  },

  webhook: {
    timeout: parseInt(getEnv('WEBHOOK_TIMEOUT'), 10),
    maxRetries: parseInt(getEnv('WEBHOOK_MAX_RETRIES'), 10),
    secret: getEnv('WEBHOOK_SECRET')
  },

  // Request timeout for agent-backend queue responses
  agentRequest: {
    timeout: parseInt(process.env.AGENT_REQUEST_TIMEOUT || '5000', 10),
    agentBackendUrl: getEnv('AGENT_BACKEND_URL'),
    // Public URL for stored file paths (fallback to internal URL if not set)
    agentBackendPublicUrl: process.env.AGENT_BACKEND_PUBLIC_URL || getEnv('AGENT_BACKEND_URL')
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
