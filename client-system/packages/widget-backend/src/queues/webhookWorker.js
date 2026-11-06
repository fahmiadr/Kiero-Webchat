/**
 * Webhook Signing Worker (Client-System)
 *
 * Signs outgoing events with HMAC-SHA256 before pushing them to the
 * outgoing-events queue for delivery to agent-backend.
 *
 * Flow: Socket handlers → [webhookQueue] → THIS WORKER → [outgoingEventQueue] → Agent
 */
import { Worker } from 'bullmq';
import { bullMqConnection, bullMqWorkerPresets, config } from '../config/index.js';
import { webhookDlqQueue, outgoingEventQueue } from './queues.js';
import crypto from 'crypto';

/**
 * Starts the webhook signing worker.
 * @param {object} logger - Pino logger instance
 * @returns {Worker} BullMQ Worker instance (for graceful shutdown)
 */
export function startWebhookWorker(logger) {
    logger.info('[WebhookWorker] Starting worker for webhook');
    const worker = new Worker('webhook', async (job) => {
        const { event, clientId, ...payload } = job.data;
        const startTime = Date.now();

        try {
            if (!clientId) {
                logger.error({ jobId: job.id, event }, '[WebhookWorker] Missing clientId, dropping job');
                return { success: false, error: 'Missing clientId' };
            }

            const messagePayload = {
                event,
                clientId,
                timestamp: new Date().toISOString(),
                ...payload
            };

            // Generate signature using global WEBHOOK_SECRET
            const signature = crypto
                .createHmac('sha256', config.webhook.secret)
                .update(JSON.stringify(messagePayload))
                .digest('hex');

            // Push to Outgoing Queue with Signature
            await outgoingEventQueue.add('outgoing-event', {
                ...messagePayload,
                signature
            });

            const duration = Date.now() - startTime;
            logger.info({ jobId: job.id, event, duration }, '[WebhookWorker] Signed and forwarded to outgoing queue');

            return { success: true };

        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error({
                jobId: job.id,
                event,
                error: error.message,
                duration
            }, '[WebhookWorker] Job failed');

            throw error;
        }
    }, {
        connection: bullMqConnection,
        ...bullMqWorkerPresets.io
    });

    worker.on('failed', async (job, error) => {
        if (!job) {
            logger.error({ error: error.message }, '[WebhookWorker] Stalled job failed (no job context)');
            return;
        }

        if (job.attemptsMade >= job.opts.attempts) {
            await webhookDlqQueue.add('failed-webhook', {
                jobId: job.id,
                queueName: job.queueName,
                originalJob: job.data,
                error: error.message,
                stackTrace: error.stack,
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
