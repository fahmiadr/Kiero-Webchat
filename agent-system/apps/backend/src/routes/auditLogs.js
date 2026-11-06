/**
 * Audit Log Routes
 * 
 * REST API endpoints for querying and exporting audit logs.
 * Protected: Admin role required.
 */
import { authenticate, authorizeAdmin } from '../middlewares/auth.js';
import { format } from 'fast-csv';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
async function auditLogRoutes(fastify) {
    /**
     * GET /api/logs
     * Query audit logs with pagination and filters.
     */
    fastify.get('/', {
        preValidation: [authenticate, authorizeAdmin],
        schema: {
            description: 'Query audit logs with pagination',
            querystring: {
                type: 'object',
                properties: {
                    limit: { type: 'integer', default: 50, minimum: 1, maximum: 100 },
                    offset: { type: 'integer', default: 0, minimum: 0 },
                    startDate: { type: 'string', format: 'date-time' },
                    endDate: { type: 'string', format: 'date-time' },
                    level: { type: 'string', enum: ['INFO', 'WARN', 'ERROR', 'CRITICAL'] },
                    source: { type: 'string', enum: ['system', 'agent', 'widget', 'external', 'queue'] },
                    event: { type: 'string' },
                    clientId: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        const { limit, offset, startDate, endDate, level, source, event, clientId } = request.query;

        const result = fastify.auditLog.query({
            limit,
            offset,
            startDate,
            endDate,
            level,
            source,
            event,
            clientId
        });

        return {
            success: true,
            data: result.logs,
            pagination: {
                total: result.total,
                limit,
                offset,
                hasMore: offset + limit < result.total
            }
        };
    });

    /**
     * GET /api/logs/heatmap
     * Get aggregated log counts for heatmap visualization.
     */
    fastify.get('/heatmap', {
        preValidation: [authenticate, authorizeAdmin],
        schema: {
            description: 'Get log volume heatmap data',
            querystring: {
                type: 'object',
                properties: {
                    hours: { type: 'integer', default: 24, minimum: 1, maximum: 168 },
                    clientId: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        const { hours, clientId } = request.query;

        const data = fastify.auditLog.getHeatmapData({ hours, clientId });

        return {
            success: true,
            data
        };
    });

    /**
     * GET /api/logs/download
     * Stream logs as CSV download.
     */
    fastify.get('/download', {
        preValidation: [authenticate, authorizeAdmin],
        schema: {
            description: 'Download logs as CSV',
            querystring: {
                type: 'object',
                properties: {
                    startDate: { type: 'string', format: 'date-time' },
                    endDate: { type: 'string', format: 'date-time' },
                    level: { type: 'string' },
                    source: { type: 'string' },
                    event: { type: 'string' },
                    clientId: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        const { startDate, endDate, level, source, event, clientId } = request.query;

        const filename = `audit_logs_${Date.now()}.csv`;

        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', `attachment; filename="${filename}"`);

        // Create CSV stream
        const csvStream = format({
            headers: ['timestamp', 'level', 'source', 'event', 'ip', 'client_id', 'metadata']
        });

        // Get iterator
        const logIterator = fastify.auditLog.streamLogs({
            startDate,
            endDate,
            level,
            source,
            event,
            clientId
        });

        // Stream logs to CSV
        reply.send(csvStream);

        // Write each log row
        for (const log of logIterator) {
            csvStream.write({
                timestamp: log.timestamp,
                level: log.level,
                source: log.source,
                event: log.event,
                ip: log.ip || '',
                client_id: log.client_id || '',
                metadata: log.metadata ? JSON.stringify(log.metadata) : ''
            });
        }

        csvStream.end();
    });

    /**
     * GET /api/logs/stats
     * Get quick statistics for dashboard widgets.
     */
    fastify.get('/stats', {
        preValidation: [authenticate, authorizeAdmin]
    }, async (request, reply) => {
        const { clientId } = request.query;

        // Get counts for last 24 hours by level
        const since = Date.now() - (24 * 60 * 60 * 1000);

        const result = fastify.auditLog.query({
            limit: 0, // We just want counts
            offset: 0,
            startDate: new Date(since).toISOString(),
            clientId
        });

        // Get breakdown by level (simplified - in production, do this in SQL)
        const allLogs = fastify.auditLog.query({
            limit: 10000,
            startDate: new Date(since).toISOString(),
            clientId
        });

        const breakdown = {
            total: allLogs.total,
            info: 0,
            warn: 0,
            error: 0,
            critical: 0
        };

        for (const log of allLogs.logs) {
            const level = log.level?.toLowerCase() || 'info';
            if (breakdown[level] !== undefined) {
                breakdown[level]++;
            }
        }

        return {
            success: true,
            data: {
                last24h: breakdown
            }
        };
    });
}

export default auditLogRoutes;
