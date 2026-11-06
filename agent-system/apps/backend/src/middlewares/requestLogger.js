/**
 * Request Logging Middleware
 * 
 * Logs HTTP requests with structured data for audit and debugging.
 * Integrates with AuditLogService for critical endpoints.
 */

/**
 * Log levels for different HTTP status codes
 */
const getLogLevel = (statusCode) => {
    if (statusCode >= 500) return 'ERROR';
    if (statusCode >= 400) return 'WARN';
    return 'INFO';
};

/**
 * Endpoints that should be logged to audit system
 */
const AUDITABLE_PATTERNS = [
    /^\/api\/auth/,
    /^\/api\/webhook/,
    /^\/api\/widget-clients/,
    /^\/api\/logs/,
    /^\/api\/report-error/
];

/**
 * Sensitive fields to redact from logs
 */
const SENSITIVE_FIELDS = ['password', 'token', 'secret', 'authorization', 'cookie'];

/**
 * Redact sensitive data from object
 */
const redactSensitive = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;

    const redacted = { ...obj };
    for (const key of Object.keys(redacted)) {
        if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f))) {
            redacted[key] = '[REDACTED]';
        } else if (typeof redacted[key] === 'object') {
            redacted[key] = redactSensitive(redacted[key]);
        }
    }
    return redacted;
};

/**
 * Check if URL should be audited
 */
const shouldAudit = (url) => {
    return AUDITABLE_PATTERNS.some(pattern => pattern.test(url));
};

/**
 * Request logging hook for Fastify
 * @param {FastifyInstance} fastify 
 */
export async function requestLoggingPlugin(fastify) {
    // Pre-handler: Log incoming request
    fastify.addHook('onRequest', async (request) => {
        request.startTime = Date.now();
    });

    // Post-handler: Log completed request
    fastify.addHook('onResponse', async (request, reply) => {
        const duration = Date.now() - (request.startTime || Date.now());
        const statusCode = reply.statusCode;
        const level = getLogLevel(statusCode);

        const logData = {
            method: request.method,
            url: request.url,
            statusCode,
            duration: `${duration}ms`,
            ip: request.ip,
            userAgent: request.headers['user-agent']?.substring(0, 100)
        };

        // Log to Pino
        if (level === 'ERROR') {
            request.log.error(logData, '[Request] Error response');
        } else if (level === 'WARN') {
            request.log.warn(logData, '[Request] Client error');
        }
        // INFO level already logged by Fastify automatically

        // Log http:request to Audit System for critical endpoints
        if (shouldAudit(request.url) && fastify.auditLog) {
            fastify.auditLog.log({
                level: level,
                source: 'system',
                event: 'http:request',
                metadata: {
                    method: request.method,
                    url: request.url,
                    statusCode,
                    duration,
                    userId: request.user?.id
                },
                ip: request.ip,
                clientId: request.user?.clientId
            });
        }
    });

    // Error handler hook
    fastify.addHook('onError', async (request, reply, error) => {
        const logData = {
            method: request.method,
            url: request.url,
            error: error.message,
            stack: error.stack?.substring(0, 500),
            ip: request.ip
        };

        request.log.error(logData, '[Request] Unhandled error');

        // Always audit errors
        if (fastify.auditLog) {
            fastify.auditLog.log({
                level: 'ERROR',
                source: 'system',
                event: 'request:error',
                metadata: {
                    url: request.url,
                    method: request.method,
                    error: error.message,
                    code: error.code
                },
                ip: request.ip
            });
        }
    });
}

export default requestLoggingPlugin;
