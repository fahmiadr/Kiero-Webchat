/**
 * Audit Logger Plugin for Fastify
 * 
 * Integrates AuditLogService into Fastify as a decorator.
 * Provides `fastify.auditLog.log()` for use in routes and services.
 */
import fp from 'fastify-plugin';
import { getAuditLogService, LogLevel, LogSource } from '../services/auditLogService.js';

async function auditLoggerPlugin(fastify, options) {
    const auditService = getAuditLogService();

    // Initialize with Fastify's logger and Socket.IO
    auditService.initialize({
        io: fastify.io,
        logger: fastify.log
    });

    // Decorate Fastify with audit logging functions
    fastify.decorate('auditLog', {
        /**
         * Log an audit event.
         * @param {object} entry - { level, source, event, metadata, ip, clientId }
         */
        log: (entry) => auditService.log(entry),

        /**
         * Query logs with pagination and filters.
         */
        query: (options) => auditService.query(options),

        /**
         * Get log stream iterator for export.
         */
        streamLogs: (options) => auditService.streamLogs(options),

        /**
         * Get heatmap data for visualization.
         */
        getHeatmapData: (options) => auditService.getHeatmapData(options),

        // Export constants for convenience
        LogLevel,
        LogSource
    });

    // Graceful shutdown hook
    fastify.addHook('onClose', async () => {
        await auditService.shutdown();
        fastify.log.info('[AuditLogger] Plugin shutdown complete');
    });

    fastify.log.info('[AuditLogger] Plugin registered');
}

export default fp(auditLoggerPlugin, {
    name: 'auditLogger',
    dependencies: ['socket'] // Ensure Socket.IO is registered first
});
