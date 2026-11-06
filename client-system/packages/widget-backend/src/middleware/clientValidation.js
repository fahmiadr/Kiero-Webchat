/**
 * Client Validation Middleware for Socket.IO
 * 
 * Validates widget clients on connection via agent-backend:
 * 1. Checks clientId is provided
 * 2. Validates origin is present (strict mode)
 * 3. Validates client via agent-backend queue
 * 4. STRICTLY validates origin against allowed list
 * 
 * SECURITY: Origin validation is the primary defense mechanism
 */
import { TenantService } from '../services/tenantService.js';

/**
 * Creates Socket.IO middleware for client validation
 * @param {Object} fastify - Fastify instance with redis
 * @param {Object} options - Validation options
 * @param {boolean} options.strictOrigin - Require origin header (default: true)
 * @returns {Function} Socket.IO middleware
 */
export const createClientValidationMiddleware = (fastify, options = {}) => {
    const { strictOrigin = true } = options;
    const tenantService = new TenantService(fastify.redis, fastify.log);

    return async (socket, next) => {
        const { clientId } = socket.handshake.query;
        const origin = socket.handshake.headers.origin;
        const ip = socket.handshake.address;

        // 1. Check required parameters
        if (!clientId) {
            fastify.log.error({ ip }, '[Security] ❌ Connection rejected: Missing clientId');
            const err = new Error('Missing clientId parameter');
            err.data = { code: 'MISSING_CLIENT_ID' };
            return next(err);
        }

        // 2. STRICT: Require origin header (prevents direct connection attempts)
        if (strictOrigin && !origin) {
            fastify.log.error({ clientId, ip }, '[Security] ❌ Connection rejected: Missing origin header');
            const err = new Error('Origin header required');
            err.data = { code: 'MISSING_ORIGIN' };
            return next(err);
        }

        try {
            // 3. Validate client via agent-backend queue
            const validation = await tenantService.getTenantConfig(clientId, origin);

            if (!validation.valid) {
                fastify.log.error({ clientId, origin, ip, validationError: validation.error }, '[Security] ❌ Connection rejected: Invalid client');
                const err = new Error(validation.error || 'Invalid Client ID');
                err.data = { code: validation.errorType || 'INVALID_CLIENT_ID', details: validation.error };
                return next(err);
            }

            // 4. STRICT: Origin MUST be in allowed list (no exceptions)
            if (origin && !validation.originValid) {
                fastify.log.error(
                    { clientId, origin, allowedOrigins: validation.allowedOrigins, ip },
                    '[Security] ❌ Connection rejected: Origin not in whitelist'
                );
                const err = new Error('Origin not allowed');
                err.data = { code: 'ORIGIN_NOT_ALLOWED', allowedOrigins: validation.allowedOrigins };
                return next(err);
            }

            // 5. Attach validated tenant info to socket
            socket.tenant = validation;
            socket.clientId = clientId;
            socket.clientIp = ip;

            fastify.log.info({ clientId, origin, ip }, '[Security] Client validated');
            next();

        } catch (error) {
            fastify.log.error({ clientId, origin, ip, err: error }, '[Security] ❌ Validation error');
            const err = new Error('Validation service unavailable');
            err.data = { code: 'SERVICE_UNAVAILABLE', details: error.message };
            return next(err);
        }
    };
};

// Legacy export for backward compatibility
export const validateClient = createClientValidationMiddleware;
