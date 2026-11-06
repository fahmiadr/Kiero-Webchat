/**
 * Audit Log Service
 * 
 * Persistent logging service for business-critical events.
 * Uses SQLite with WAL mode for high-performance writes.
 * Implements micro-batching for robustness under high load.
 * 
 * Features:
 * - Multi-tenant support (client_id filtering)
 * - 1-month retention policy with automatic cleanup
 * - Realtime emission to Socket.IO admin room
 * - Streaming export to CSV
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration Constants
const LOG_DIR = path.join(__dirname, '../../logs');
const DB_PATH = path.join(LOG_DIR, 'audit.db');
const BATCH_SIZE = 100;
const BATCH_INTERVAL_MS = 200;
const RETENTION_DAYS = 30; // 1 month
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // Run cleanup every 6 hours

// Log Levels
export const LogLevel = {
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
    CRITICAL: 'CRITICAL'
};

// Log Sources
export const LogSource = {
    SYSTEM: 'system',
    AGENT: 'agent',
    WIDGET: 'widget',
    EXTERNAL: 'external',
    QUEUE: 'queue'
};

// Singleton instance
let instance = null;

/**
 * AuditLogService Class
 * Designed as a Singleton to manage SQLite connection and batching.
 */
class AuditLogService {
    constructor() {
        this.db = null;
        this.io = null;
        this.logger = console; // Default to console, can be replaced with Pino
        this.batch = [];
        this.flushTimer = null;
        this.isShuttingDown = false;

        // Socket.IO Throttling (50ms = ~20fps max)
        this.socketBuffer = [];
        this.lastSocketEmit = 0;
        this.socketThrottleMs = 100; // 10Hz (Human perception limit / easier on client)
        this.socketFlushScheduled = false;

        // Periodic cleanup timer
        this.cleanupTimer = null;
    }

    /**
     * Initialize the service.
     * @param {object} options - { io: Socket.IO instance, logger: Pino/Console }
     */
    initialize(options = {}) {
        if (this.db) {
            this.logger.warn('[AuditLog] Already initialized');
            return this;
        }

        this.io = options.io || null;
        this.logger = options.logger || console;

        // Ensure log directory exists
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
            this.logger.info(`[AuditLog] Created log directory: ${LOG_DIR}`);
        }

        // Open SQLite database with WAL mode
        this.db = new Database(DB_PATH);

        // === SQLite Performance Pragmas (Industry Best Practices) ===
        this.db.pragma('journal_mode = WAL');           // Write-Ahead Logging for concurrent reads
        this.db.pragma('synchronous = NORMAL');         // Balance between safety and speed
        this.db.pragma('cache_size = -64000');          // 64MB cache (negative = KB)
        this.db.pragma('mmap_size = 268435456');        // 256MB memory-mapped I/O
        this.db.pragma('busy_timeout = 5000');          // 5s timeout for concurrent access
        this.db.pragma('temp_store = MEMORY');          // Store temp tables in memory

        // Create table if not exists
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                level TEXT NOT NULL,
                source TEXT NOT NULL,
                event TEXT NOT NULL,
                metadata TEXT,
                ip TEXT,
                client_id TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_timestamp ON audit_logs(timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_client_timestamp ON audit_logs(client_id, timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_level_source ON audit_logs(level, source);
            CREATE INDEX IF NOT EXISTS idx_event ON audit_logs(event);
        `);

        this.logger.info('[AuditLog] SQLite database initialized');

        // Start batch flush timer
        this._startFlushTimer();

        // Register shutdown handlers
        this._registerShutdownHandlers();

        // Run retention cleanup on startup
        this._cleanupOldLogs();

        // Schedule periodic cleanup (every 6 hours)
        this._startCleanupScheduler();

        return this;
    }

    /**
     * Log an audit event.
     * @param {object} entry - { level, source, event, metadata, ip, clientId }
     */
    log(entry) {
        if (!this.db) {
            this.logger.error('[AuditLog] Service not initialized');
            return;
        }

        const record = {
            timestamp: Date.now(),
            level: entry.level || LogLevel.INFO,
            source: entry.source || LogSource.SYSTEM,
            event: entry.event || 'unknown',
            metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
            ip: entry.ip || null,
            client_id: entry.clientId || null
        };

        // Add to batch
        this.batch.push(record);

        // Emit to Socket.IO (Real-time)
        this._emitToAdmin(record);

        // Flush if batch is full
        if (this.batch.length >= BATCH_SIZE) {
            this._flushBatch();
        }
    }

    /**
     * Query logs with pagination and filters.
     * @param {object} options - { limit, offset, startDate, endDate, level, source, event, clientId }
     * @returns {object} - { logs: [], total: number }
     */
    query(options = {}) {
        const {
            limit = 50,
            offset = 0,
            startDate,
            endDate,
            level,
            source,
            event,
            clientId
        } = options;

        const conditions = [];
        const params = {};

        if (startDate) {
            conditions.push('timestamp >= $startDate');
            params.startDate = new Date(startDate).getTime();
        }
        if (endDate) {
            conditions.push('timestamp <= $endDate');
            params.endDate = new Date(endDate).getTime();
        }
        if (level) {
            conditions.push('level = $level');
            params.level = level;
        }
        if (source) {
            conditions.push('source = $source');
            params.source = source;
        }
        if (event) {
            conditions.push('event LIKE $event');
            params.event = `%${event}%`;
        }
        if (clientId) {
            conditions.push('client_id = $clientId');
            params.clientId = clientId;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Count total
        const countStmt = this.db.prepare(`SELECT COUNT(*) as total FROM audit_logs ${whereClause}`);
        const { total } = countStmt.get(params);

        // Fetch paginated results
        const selectStmt = this.db.prepare(`
            SELECT * FROM audit_logs 
            ${whereClause}
            ORDER BY timestamp DESC
            LIMIT $limit OFFSET $offset
        `);

        const logs = selectStmt.all({ ...params, limit, offset });

        // Parse metadata JSON
        const parsedLogs = logs.map(log => ({
            ...log,
            metadata: log.metadata ? JSON.parse(log.metadata) : null,
            timestamp: new Date(log.timestamp).toISOString()
        }));

        return { logs: parsedLogs, total };
    }

    /**
     * Get an iterator for streaming export.
     * @param {object} options - Same as query options (without pagination)
     * @returns {Iterator}
     */
    *streamLogs(options = {}) {
        const { startDate, endDate, level, source, event, clientId } = options;

        const conditions = [];
        const params = {};

        if (startDate) {
            conditions.push('timestamp >= $startDate');
            params.startDate = new Date(startDate).getTime();
        }
        if (endDate) {
            conditions.push('timestamp <= $endDate');
            params.endDate = new Date(endDate).getTime();
        }
        if (level) {
            conditions.push('level = $level');
            params.level = level;
        }
        if (source) {
            conditions.push('source = $source');
            params.source = source;
        }
        if (event) {
            conditions.push('event LIKE $event');
            params.event = `%${event}%`;
        }
        if (clientId) {
            conditions.push('client_id = $clientId');
            params.clientId = clientId;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const stmt = this.db.prepare(`
            SELECT * FROM audit_logs 
            ${whereClause}
            ORDER BY timestamp DESC
        `);

        for (const row of stmt.iterate(params)) {
            yield {
                ...row,
                metadata: row.metadata ? JSON.parse(row.metadata) : null,
                timestamp: new Date(row.timestamp).toISOString()
            };
        }
    }

    /**
     * Get aggregated stats for heatmap (hourly counts).
     * @param {object} options - { hours, clientId }
     */
    getHeatmapData(options = {}) {
        const { hours = 24, clientId } = options;
        const since = Date.now() - (hours * 60 * 60 * 1000);

        let query = `
            SELECT 
                (timestamp / 3600000) * 3600000 as hour_bucket,
                level,
                COUNT(*) as count
            FROM audit_logs
            WHERE timestamp >= $since
        `;

        const params = { since };

        if (clientId) {
            query += ` AND client_id = $clientId`;
            params.clientId = clientId;
        }

        query += ` GROUP BY hour_bucket, level ORDER BY hour_bucket`;

        const stmt = this.db.prepare(query);
        return stmt.all(params);
    }

    /**
     * Graceful shutdown - flush remaining batch.
     */
    async shutdown() {
        this.isShuttingDown = true;

        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        // Synchronous flush for shutdown
        this._flushBatchSync();

        if (this.db) {
            // Run optimize before closing (SQLite best practice)
            try {
                this.db.pragma('optimize');
            } catch (e) {
                // Ignore optimize errors
            }
            this.db.close();
            this.logger.info('[AuditLog] Database connection closed');
        }
    }

    // === Private Methods ===

    _startFlushTimer() {
        this.flushTimer = setInterval(() => {
            if (this.batch.length > 0) {
                this._flushBatch();
            }
        }, BATCH_INTERVAL_MS);
    }

    _flushBatch() {
        if (this.batch.length === 0) return;

        const toInsert = [...this.batch];
        this.batch = [];

        try {
            const insert = this.db.prepare(`
                INSERT INTO audit_logs (timestamp, level, source, event, metadata, ip, client_id)
                VALUES ($timestamp, $level, $source, $event, $metadata, $ip, $client_id)
            `);

            const insertMany = this.db.transaction((logs) => {
                for (const log of logs) {
                    insert.run(log);
                }
            });

            insertMany(toInsert);
            this.logger.debug(`[AuditLog] Flushed ${toInsert.length} logs to SQLite`);
        } catch (error) {
            this.logger.error({ err: error }, '[AuditLog] Failed to flush batch');
            // Re-add to batch for retry (with limit to prevent infinite growth)
            if (this.batch.length < BATCH_SIZE * 5) {
                this.batch.unshift(...toInsert);
            }
        }
    }

    _flushBatchSync() {
        if (this.batch.length === 0) return;

        try {
            const insert = this.db.prepare(`
                INSERT INTO audit_logs (timestamp, level, source, event, metadata, ip, client_id)
                VALUES ($timestamp, $level, $source, $event, $metadata, $ip, $client_id)
            `);

            const insertMany = this.db.transaction((logs) => {
                for (const log of logs) {
                    insert.run(log);
                }
            });

            insertMany(this.batch);
            this.logger.info(`[AuditLog] Shutdown: Flushed ${this.batch.length} remaining logs`);
            this.batch = [];
        } catch (error) {
            this.logger.error({ err: error }, '[AuditLog] Shutdown: Failed to flush batch');
        }
    }

    _emitToAdmin(record) {
        if (!this.io) return;

        const parsed = {
            ...record,
            metadata: record.metadata ? JSON.parse(record.metadata) : null,
            timestamp: new Date(record.timestamp).toISOString()
        };

        // Add to socket buffer
        this.socketBuffer.push(parsed);

        const now = Date.now();
        const elapsed = now - this.lastSocketEmit;

        // Throttle: emit batch if 50ms has passed
        if (elapsed >= this.socketThrottleMs) {
            this._flushSocketBuffer();
        } else if (!this.socketFlushScheduled) {
            // Schedule flush
            this.socketFlushScheduled = true;
            setTimeout(() => {
                this._flushSocketBuffer();
                this.socketFlushScheduled = false;
            }, this.socketThrottleMs - elapsed);
        }
    }

    _flushSocketBuffer() {
        if (this.socketBuffer.length === 0) return;

        try {
            // Emit batch to reduce network overhead
            if (this.socketBuffer.length === 1) {
                this.io.to('admin:logs').emit('log:new', this.socketBuffer[0]);
            } else {
                this.io.to('admin:logs').emit('log:batch', this.socketBuffer);
            }
            this.lastSocketEmit = Date.now();
            this.socketBuffer = [];
        } catch (error) {
            // Silent fail for socket emission
        }
    }

    _cleanupOldLogs() {
        const cutoff = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);

        try {
            const result = this.db.prepare('DELETE FROM audit_logs WHERE timestamp < $cutoff').run({ cutoff });
            if (result.changes > 0) {
                this.logger.info(`[AuditLog] Retention cleanup: Deleted ${result.changes} old logs`);

                // Run incremental vacuum after large deletes (best practice)
                if (result.changes > 1000) {
                    this.db.pragma('incremental_vacuum');
                }
            }
        } catch (error) {
            this.logger.error({ err: error }, '[AuditLog] Retention cleanup failed');
        }
    }

    _startCleanupScheduler() {
        // Run cleanup periodically (every 6 hours)
        this.cleanupTimer = setInterval(() => {
            if (!this.isShuttingDown) {
                this._cleanupOldLogs();
            }
        }, CLEANUP_INTERVAL_MS);

        // Don't prevent process exit
        if (this.cleanupTimer.unref) {
            this.cleanupTimer.unref();
        }
    }

    _registerShutdownHandlers() {
        const gracefulShutdown = () => {
            if (!this.isShuttingDown) {
                this.shutdown();
            }
        };

        process.on('SIGTERM', gracefulShutdown);
        process.on('SIGINT', gracefulShutdown);
    }
}

/**
 * Get the singleton instance of AuditLogService.
 * @returns {AuditLogService}
 */
export function getAuditLogService() {
    if (!instance) {
        instance = new AuditLogService();
    }
    return instance;
}

export default AuditLogService;
