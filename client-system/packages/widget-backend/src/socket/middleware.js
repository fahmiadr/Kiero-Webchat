import { TenantService } from '../services/tenantService.js';

export const socketAuthMiddleware = (fastify) => {
    return async (socket, next) => {
        try {
            const { clientId } = socket.handshake.query;
            const origin = socket.handshake.headers.origin;

            if (!clientId) {
                fastify.log.warn(`[SEC] Connection rejected: Missing clientId | Socket:${socket.id} | Origin:${origin}`);
                return next(new Error('Authentication failed: Missing clientId'));
            }

            const tenantService = new TenantService(fastify.redis);
            const tenant = await tenantService.getTenantConfig(clientId);

            if (!tenant) {
                fastify.log.warn(`[SEC] Connection rejected: Invalid clientId | Client:${clientId} | Origin:${origin}`);
                return next(new Error('Invalid clientId'));
            }

            // Domain Whitelisting Check (Strict)
            if (tenant.allowedOrigins && tenant.allowedOrigins.length > 0) {
                const isAllowed = tenant.allowedOrigins.some(allowed =>
                    origin === allowed || origin?.startsWith(allowed) // Allow subpaths if needed, or strict match
                );

                // Strict Match is safer: allowedOrigins should contain base domains (e.g. http://localhost:5173)
                // Browser sends Origin header as "scheme://host:port" (no path).
                // So strict match/includes is better.

                const isValid = tenant.allowedOrigins.includes(origin);

                if (!isValid) {
                    fastify.log.warn(`[SEC] Connection rejected: Unauthorized Origin | Page:${clientId} | Origin:${origin} | Allowed:${tenant.allowedOrigins.join(',')}`);
                    return next(new Error('Unauthorized origin'));
                }
            }

            // Attach tenant info to socket for later use if needed
            socket.data.tenant = tenant;

            next();
        } catch (err) {
            fastify.log.error({ err }, '[SEC] Middleware error');
            next(new Error('Authentication error'));
        }
    };
};
