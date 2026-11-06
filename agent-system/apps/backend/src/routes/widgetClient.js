import widgetClientService from '../services/widgetClientService.js';
import { authenticate, authorizeAdmin } from '../middlewares/auth.js';
import { SECURITY_CONFIG } from '../config/security.js';

// Schemas
const clientBodySchema = {
    type: 'object',
    required: ['name'],
    properties: {
        name: { type: 'string', minLength: 2 },
        allowedOrigins: {
            type: 'array',
            items: { type: 'string' },
            default: []
        },
        webhookUrl: { type: ['string', 'null'] },
        webhookToken: { type: ['string', 'null'] },
        active: { type: 'boolean', default: true }
    }
};

const clientParamsSchema = {
    type: 'object',
    required: ['id'],
    properties: {
        id: { type: 'string' }
    }
};

const clientThemeSchema = {
    type: 'object',
    required: ['theme'],
    properties: {
        theme: {
            type: 'object',
            additionalProperties: true,
        }
    },
};

const clientBotConfigSchema = {
    type: 'object',
    required: ['botConfig'],
    properties: {
        botConfig: {
            type: 'object',
            additionalProperties: true,
        }
    },
};

async function widgetClientRoutes(fastify, options) {
    // Protect all routes
    fastify.addHook('preValidation', authenticate);
    fastify.addHook('preValidation', authorizeAdmin);

    // Rate Limit for these routes
    const routeConfig = {
        rateLimit: SECURITY_CONFIG.RATE_LIMITS.WIDGET_CLIENT
    };

    fastify.get('/', {
        config: routeConfig
    }, async (request, reply) => {
        try {
            const clients = await widgetClientService.getAll();
            return { success: true, data: clients };
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to fetch clients' });
        }
    });

    // Get Single Client
    fastify.get('/:id', {
        config: routeConfig,
        schema: {
            params: clientParamsSchema
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const client = await widgetClientService.getById(id);
            if (!client) {
                return reply.code(404).send({ error: 'Client not found' });
            }
            return { success: true, data: client };
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to fetch client' });
        }
    });

    fastify.post('/', {
        config: routeConfig,
        schema: {
            body: clientBodySchema
        }
    }, async (request, reply) => {
        try {
            const client = await widgetClientService.create(request.body);

            // Audit log: Widget client created
            fastify.auditLog?.log({
                level: 'INFO',
                source: 'system',
                event: 'config:create',
                metadata: {
                    entityType: 'widgetClient',
                    clientId: client.clientId,
                    name: client.name
                },
                ip: request.ip
            });

            return { success: true, data: client };
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to create client: ' + error.message });
        }
    });

    fastify.put('/:id', {
        config: routeConfig,
        schema: {
            params: clientParamsSchema,
            body: clientBodySchema
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const client = await widgetClientService.update(id, request.body);

            // Audit log: Widget client updated
            fastify.auditLog?.log({
                level: 'INFO',
                source: 'system',
                event: 'config:update',
                metadata: {
                    entityType: 'widgetClient',
                    clientId: client.clientId,
                    changes: Object.keys(request.body)
                },
                ip: request.ip
            });

            return { success: true, data: client };
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to update client' });
        }
    });

    fastify.delete('/:id', {
        config: routeConfig,
        schema: {
            params: clientParamsSchema
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            await widgetClientService.delete(id);

            // Audit log: Widget client deleted
            fastify.auditLog?.log({
                level: 'WARN',
                source: 'system',
                event: 'config:delete',
                metadata: {
                    entityType: 'widgetClient',
                    clientDbId: id
                },
                ip: request.ip
            });

            return { success: true, message: 'Client deleted' };
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to delete client' });
        }
    });

    fastify.post('/:id/rotate-key', {
        config: routeConfig,
        schema: {
            params: clientParamsSchema
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const client = await widgetClientService.rotateApiKey(id);
            return { success: true, data: client };
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to rotate API key' });
        }
    });

    fastify.post('/:id/rotate-secret', {
        config: routeConfig,
        schema: {
            params: clientParamsSchema
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const client = await widgetClientService.rotateWebhookSecret(id);
            return { success: true, data: client };
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to rotate Webhook Secret' });
        }
    });

    fastify.put('/:id/theme', {
        config: routeConfig,
        schema: {
            params: clientParamsSchema,
            body: clientThemeSchema
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const client = await widgetClientService.updateTheme(id, request.body.theme);

            // Audit log: Widget theme updated
            fastify.auditLog?.log({
                level: 'INFO',
                source: 'system',
                event: 'config:theme:update',
                metadata: {
                    entityType: 'widgetClient',
                    clientId: client.clientId
                },
                ip: request.ip
            });

            return { success: true, data: client };
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to update client theme' });
        }
    });

    fastify.put('/:id/bot-config', {
        config: routeConfig,
        schema: {
            params: clientParamsSchema,
            body: clientBotConfigSchema
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const client = await widgetClientService.updateBotConfig(id, request.body.botConfig);

            // Audit log: Widget bot config updated
            fastify.auditLog?.log({
                level: 'INFO',
                source: 'system',
                event: 'config:bot:update',
                metadata: {
                    entityType: 'widgetClient',
                    clientId: client.clientId
                },
                ip: request.ip
            });

            return { success: true, data: client };
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to update client bot configuration' });
        }
    });

    // Reveal API Key (Decrypt for admin viewing)
    fastify.get('/:id/reveal-key', {
        config: routeConfig,
        schema: {
            params: clientParamsSchema
        }
    }, async (request, reply) => {
        try {
            const { id } = request.params;
            const result = await widgetClientService.revealApiKey(id);
            return { success: true, data: result };
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to reveal API key' });
        }
    });

    // Bot Config Preview
    fastify.post('/:id/bot-config/preview', {
        config: routeConfig,
        schema: {
            params: clientParamsSchema,
            body: clientBotConfigSchema
        }
    }, async (request, reply) => {
        try {
            // Import timeHelper here to avoid circular dependencies if any
            const { resolveWelcomeMessage } = await import('../utils/timeHelper.js');
            const { botConfig: globalBotConfig } = await import('../config/botConfig.js');

            const rendered = resolveWelcomeMessage(
                request.body.botConfig,
                globalBotConfig.welcomeMessage
            );

            return { success: true, data: rendered };
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Failed to generate bot preview' });
        }
    });
}

export default widgetClientRoutes;
