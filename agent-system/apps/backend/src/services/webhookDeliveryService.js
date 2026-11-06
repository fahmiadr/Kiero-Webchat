/**
 * Webhook Delivery Service
 * 
 * Handles forwarding chat events to external server URLs (url_api).
 * Includes simple retry logic and error logging.
 */
import { webhookQueue } from '../queues/eventQueues.js';
import prisma from '../config/prismaClient.js';
import { decrypt } from '../utils/security.js';

export class WebhookDeliveryService {
    constructor(logger) {
        this.logger = logger;
    }

    /**
     * Forward an event to the external webhook
     * @param {string} clientId - The ID of the widget client
     * @param {string} event - The event name
     * @param {Object} payload - The data to send
     */
    async forwardEvent(clientId, event, payload) {
        try {
            // 1. Lookup the widget client to get the webhook URL
            const account = await prisma.widgetClient.findUnique({
                where: { clientId }
            });

            if (!account || !account.webhookUrl) {
                this.logger.debug(`[WebhookService] No webhookUrl found for clientId: ${clientId}. Skipping forwarding.`);
                return;
            }

            const webhookUrl = account.webhookUrl;
            this.logger.info(`[WebhookService] Queuing ${event} to ${webhookUrl}`);

            // 2. Add to Queue (Fire and Forget)
            // Note: We decrypt secrets here so the worker uses raw values. 
            // Alternatively, we could pass encrypted and decrypt in worker to keep Redis secure.
            // For now, simplify logic.
            const rawToken = account.webhookToken ? decrypt(account.webhookToken) : null;
            const rawSecret = account.webhookSecret ? decrypt(account.webhookSecret) : null;

            await webhookQueue.add('send-webhook', {
                url: webhookUrl,
                event,
                clientId,
                payload,
                token: rawToken, // Authorization Token
                secret: rawSecret, // HMAC Secret
                timestamp: new Date().toISOString()
            });

            return true;

        } catch (error) {
            this.logger.error({
                clientId,
                event,
                error: error.message
            }, '[WebhookService] Failed to queue webhook event');

            return false;
        }
    }
}

let instance = null;
export const getWebhookDeliveryService = (logger) => {
    if (!instance) {
        instance = new WebhookDeliveryService(logger);
    }
    return instance;
};
