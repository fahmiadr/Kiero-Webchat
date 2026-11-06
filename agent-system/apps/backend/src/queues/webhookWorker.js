/**
 * Webhook Event Worker (Agent-System)
 *
 * Delivers webhook payloads to external endpoints configured per WidgetClient.
 * Wrapped in a factory function for proper Fastify lifecycle integration
 * (graceful shutdown via onClose).
 */
import { Worker } from 'bullmq';
import { bullMqConnection, bullMqWorkerPresets } from '../config/index.js';
import { eventDlqQueue } from './eventQueues.js';
import axios from 'axios';
import https from 'https';
import crypto from 'crypto';

/**
 * Starts the webhook delivery worker.
 * @param {object} logger - Pino logger instance
 * @returns {Worker} BullMQ Worker instance (for graceful shutdown)
 */
export function startWebhookWorker(logger) {
    logger.info('[WebhookWorker] Starting worker for webhook-events');
    const worker = new Worker('webhook-events', async (job) => {
        const { url, event, clientId, payload, token, secret } = job.data;

        await job.log(`Processing webhook: ${event} to ${url}`);

        try {
            const headers = {
                'Content-Type': 'application/json',
                'X-WebChat-Event': event,
                'X-WebChat-Client-Id': clientId,
                ...(token ? { 'Authorization': token } : {})
            };

            // Generate HMAC Signature if secret exists (Optional Security)
            if (secret) {
                const signature = crypto
                    .createHmac('sha256', secret)
                    .update(JSON.stringify(payload))
                    .digest('hex');

                headers['X-Hub-Signature'] = signature;
            }

            const response = await axios.post(url, payload, {
                timeout: 10000,
                headers,
                // Allow self-signed certs (e.g. for internal/dev webhooks)
                httpsAgent: new https.Agent({
                    rejectUnauthorized: false
                })
            });

            await job.log(`Success: ${response.status}`);
            return { status: response.status, data: response.data };

        } catch (error) {
            const msg = `Webhook failed: ${error.message}`;
            await job.log(msg);

            // Throwing error triggers BullMQ retry (backoff)
            throw new Error(msg);
        }
    }, {
        connection: bullMqConnection,
        ...bullMqWorkerPresets.io
    });

    worker.on('failed', async (job, err) => {
        if (!job) {
            logger.error({ error: err.message }, '[WebhookWorker] Stalled job failed (no job context)');
            return;
        }

        if (job.attemptsMade >= job.opts.attempts) {
            await eventDlqQueue.add('failed-webhook-delivery', {
                jobId: job.id,
                queueName: job.queueName,
                originalJob: job.data,
                error: err.message,
                stackTrace: err.stack,
                attempts: job.attemptsMade,
                failedAt: new Date().toISOString()
            });
            logger.error({ jobId: job.id }, '[WebhookWorker] Job exhausted retries → moved to DLQ');
        }
    });

    worker.on('error', (err) => {
        logger.error({ err }, '[WebhookWorker] Worker error');
    });

    return worker;
}
