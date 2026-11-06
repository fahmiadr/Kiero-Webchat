/**
 * HTTP Client Validation Middleware
 *
 * Validates widget clients on HTTP requests via agent-backend (same as socket middleware).
 * Extracts clientId from X-Client-Id header or clientId query param.
 *
 * Security: Ensures only valid, registered widget clients can access API routes.
 * Reuses TenantService for consistent validation + Redis caching.
 */
import { TenantService } from '../services/tenantService.js';

/**
 * Creates Fastify onRequest hook for HTTP client validation
 * @param {object} fastify - Fastify instance with redis + log
 * @returns {Function} Fastify onRequest hook
 */
export const createHttpClientValidation = (fastify) => {
    const tenantService = new TenantService(fastify.redis, fastify.log);

    return async (request, reply) => {
        // Extract clientId from header (preferred) or query param (fallback)
        const clientId = request.headers['x-client-id'] || request.query?.clientId;
        const origin = request.headers.origin;
        const ip = request.ip;

        // 1. Require clientId
        if (!clientId) {
            fastify.log.warn({ ip, url: request.url }, '[HTTP-Auth] Rejected: Missing clientId');
            return reply.code(401).send({
                success: false,
                error: {
                    code: 'MISSING_CLIENT_ID',
                    message: 'X-Client-Id header or clientId query param is required'
                }
            });
        }

        try {
            // 2. Validate via TenantService (cached + broker)
            const validation = await tenantService.getTenantConfig(clientId, origin);

            if (!validation.valid) {
                fastify.log.warn(
                    { clientId, origin, ip },
                    '[HTTP-Auth] Rejected: Invalid clientId'
                );
                return reply.code(403).send({
                    success: false,
                    error: {
                        code: 'INVALID_CLIENT_ID',
                        message: 'Client ID is not registered or inactive'
                    }
                });
            }

            // 3. Check origin if present
            if (origin && !validation.originValid) {
                fastify.log.warn(
                    { clientId, origin, allowedOrigins: validation.allowedOrigins, ip },
                    '[HTTP-Auth] Rejected: Origin not in whitelist'
                );
                return reply.code(403).send({
                    success: false,
                    error: {
                        code: 'ORIGIN_NOT_ALLOWED',
                        message: 'Request origin is not whitelisted for this client'
                    }
                });
            }

            // 4. Attach tenant info to request for downstream use
            request.tenant = validation;
            request.clientId = clientId;

        } catch (error) {
            fastify.log.error({ clientId, err: error }, '[HTTP-Auth] Validation service error');
            return reply.code(503).send({
                success: false,
                error: {
                    code: 'SERVICE_UNAVAILABLE',
                    message: 'Client validation service temporarily unavailable'
                }
            });
        }
    };
};
