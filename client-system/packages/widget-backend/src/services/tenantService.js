/**
 * TenantService - Validates widget clients via agent-backend
 * 
 * All tenant data is stored in agent-backend database.
 * This service communicates via message broker to validate clients.
 */
import { getAgentBroker } from './agentBroker.js';

export class TenantService {
    constructor(redis, logger) {
        this.redis = redis;
        this.logger = logger;
        this.agentBroker = getAgentBroker(logger);
        // Cache validated clients in Redis with TTL
        this.cacheTtl = 300; // 5 minutes
    }

    /**
     * Validate a widget client by clientId (acts as getTenantConfig)
     * Checks cache first, then queries agent-backend via queue
     * @param {string} clientId - The client/tenant identifier
     * @param {string} origin - Request origin for CORS validation
     * @returns {Promise<{valid: boolean, allowedOrigins?: string[], secret?: string}>}
     */
    async getTenantConfig(clientId, origin) {
        // Check cache first
        const cacheKey = `tenant:${clientId}`;
        const cached = await this.redis.get(cacheKey);

        if (cached) {
            const tenant = JSON.parse(cached);
            this.logger?.info({ clientId }, '[TenantService] Cache hit');

            // Validate against cached data
            const result = this.checkOrigin(tenant, origin);

            // If valid, return immediately
            // If invalid (origin mismatch or explicitly invalid), ignore cache and fetch fresh
            if (result.valid) {
                return result;
            }

            this.logger?.warn({ clientId }, '[TenantService] Cache validation failed/invalid. Refetching from backend...');
        }

        // Request validation from agent-backend
        this.logger?.info({ clientId, origin }, '[TenantService] Validating via agent-backend');
        const result = await this.agentBroker.validateClient(clientId, origin);

        if (result.valid) {
            // Cache the tenant data
            await this.redis.setex(cacheKey, this.cacheTtl, JSON.stringify(result));
        }

        return result;
    }

    /**
     * Check if origin is allowed for tenant
     */
    checkOrigin(tenant, origin) {
        if (!origin) {
            return { ...tenant, valid: true };
        }

        // Allow if no restrictions (empty allowedOrigins)
        if (!tenant.allowedOrigins || tenant.allowedOrigins.length === 0) {
            return { ...tenant, valid: true, originValid: true };
        }

        const isAllowed = tenant.allowedOrigins.some(allowed => {
            if (allowed === '*') return true;
            return origin === allowed || origin.startsWith(allowed.replace('*', ''));
        });

        return {
            ...tenant,
            valid: isAllowed,
            originValid: isAllowed
        };
    }

    /**
     * Invalidate cached tenant data (e.g., when config changes)
     */
    async invalidateCache(clientId) {
        await this.redis.del(`tenant:${clientId}`);
    }
}
