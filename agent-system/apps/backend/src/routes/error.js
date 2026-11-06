/**
 * Error Reporting Route (Agent Backend)
 * 
 * Receives error reports from the widget frontend (via widget-backend proxy)
 * and stores them in the centralized audit log system (SQLite).
 * 
 * Uses the same patterns as auth.js:
 * - Fastify JSON Schema validation
 * - fastify.auditLog?.log() with optional chaining
 * - Structured { level, source, event, metadata, ip, clientId } format
 * - authenticate middleware for signature verification
 */
import { authenticate } from '../middlewares/auth.js';

async function errorRoutes(fastify, options) {

    // Schema for error report payload
    const reportErrorSchema = {
        body: {
            type: 'object',
            required: ['error'],
            properties: {
                clientId: { type: 'string' },
                error: {
                    type: 'object',
                    required: ['message'],
                    properties: {
                        message: { type: 'string' },
                        name: { type: 'string' },
                        stack: { type: 'string' },
                        componentStack: { type: 'string' }
                    }
                },
                source: { type: 'string', default: 'widget' },
                url: { type: 'string' },
                timestamp: { type: 'string' },
                ip: { type: 'string' },
                userAgent: { type: 'string' }
            }
        },
        response: {
            200: {
                type: 'object',
                properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' }
                }
            }
        }
    };

    fastify.post('/report-error', {
        schema: reportErrorSchema,
        preValidation: [authenticate]
    }, async (request, reply) => {
        try {
            const { error, source, clientId, url, userAgent, ip, timestamp } = request.body;

            // Determine origin system (widget, agent, external)
            const logSource = source || 'widget';

            // Store in audit log system (same pattern as auth.js)
            fastify.auditLog?.log({
                level: 'ERROR',
                source: logSource,
                event: `${logSource}:runtime_error`,
                metadata: {
                    errorName: error.name || 'UnknownError',
                    errorMessage: error.message,
                    // Truncate stack traces to prevent SQLite bloat
                    stack: error.stack?.substring(0, 500),
                    componentStack: error.componentStack?.substring(0, 300),
                    url,
                    userAgent
                },
                ip: ip || request.ip,
                clientId: clientId || null
            });

            request.log.info(
                { clientId, source: logSource, errorName: error.name },
                '[ErrorReport] Client error logged to audit system'
            );

            return { success: true, message: 'Error reported' };

        } catch (err) {
            request.log.error(err, '[ErrorReport] Failed to process error report');
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });
}

export default errorRoutes;
