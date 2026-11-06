/**
 * Request Worker for Agent Backend
 * 
 * Processes incoming signed requests from widget-backend via queue:
 * - validate:client - Validate widget client and return config
 * - fetch:history - Fetch message history for an interaction
 * 
 * All requests must include a valid HMAC-SHA256 signature.
 */
import { Worker } from 'bullmq';
import crypto from 'crypto';
import { bullMqConnection, bullMqWorkerPresets, config } from '../config/index.js';
import { responseQueue } from './eventQueues.js';
import prisma from '../config/prismaClient.js';
import { botConfig } from '../config/botConfig.js';

/**
 * Verify HMAC signature
 */
function verifySignature(signableData, providedSignature, secret) {
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(signableData))
        .digest('hex');

    if (providedSignature.length !== expectedSignature.length) {
        return false;
    }

    return crypto.timingSafeEqual(
        Buffer.from(providedSignature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
    );
}

/**
 * Check if timestamp is valid (within 5 minutes)
 */
function isTimestampValid(timestamp, maxAge = 5 * 60 * 1000) {
    const now = Date.now();
    const age = now - timestamp;
    return age >= 0 && age <= maxAge;
}

/**
 * Starts the request worker to handle widget-backend requests
 */
export function startRequestWorker(logger) {
    logger.info('[RequestWorker] Starting worker with signature verification');

    const worker = new Worker('agent_requests', async (job) => {
        const { requestId, type, payload, timestamp, signature } = job.data;
        const startTime = Date.now();

        logger.info({ requestId, type }, '[RequestWorker] Processing signed request');

        // === SECURITY: Verify signature ===
        const signableData = { requestId, type, payload, timestamp };

        if (!signature) {
            logger.warn({ requestId }, '[RequestWorker] ❌ Missing signature');
            await responseQueue.add('response', {
                requestId,
                success: false,
                error: 'Missing signature'
            });
            return { success: false, reason: 'missing_signature' };
        }

        if (!isTimestampValid(timestamp)) {
            logger.warn({ requestId, timestamp }, '[RequestWorker] ❌ Request expired');
            await responseQueue.add('response', {
                requestId,
                success: false,
                error: 'Request expired'
            });
            return { success: false, reason: 'expired' };
        }

        if (!verifySignature(signableData, signature, config.webhookSecret)) {
            logger.warn({ requestId }, '[RequestWorker] ❌ Invalid signature');
            await responseQueue.add('response', {
                requestId,
                success: false,
                error: 'Invalid signature'
            });
            return { success: false, reason: 'invalid_signature' };
        }

        logger.info({ requestId }, '[RequestWorker] Signature verified');

        try {
            let responseData;

            switch (type) {
                case 'validate:client': {
                    const { clientId, origin } = payload;

                    // Lookup widget client by clientId
                    const client = await prisma.widgetClient.findUnique({
                        where: { clientId: clientId }
                    });

                    if (!client) {
                        responseData = {
                            valid: false,
                            error: 'Invalid Client ID'
                        };
                        break;
                    }

                    if (!client.active) {
                        responseData = {
                            valid: false,
                            error: 'Client Inactive'
                        };
                        break;
                    }

                    // Check origin if provided
                    let originValid = true;
                    if (origin && client.allowedOrigins?.length > 0) {
                        originValid = client.allowedOrigins.some(allowed => {
                            if (allowed === '*') return true;
                            // Clean entry URL (remove trailing slash)
                            const cleanOrigin = origin.replace(/\/$/, '');
                            const cleanAllowed = allowed.replace(/\/$/, '');
                            return cleanOrigin === cleanAllowed || cleanOrigin.startsWith(cleanAllowed);
                        });
                    }

                    responseData = {
                        valid: true,
                        originValid,
                        clientId: client.clientId,
                        name: client.name,
                        theme: client.theme, // Provide theme to frontend
                        allowedOrigins: client.allowedOrigins,
                        // Session TTL from per-client botConfig, fallback to system default
                        sessionTtlSeconds: client.botConfig?.sessionTtlSeconds || botConfig.sessionTtlSeconds,
                    };
                    break;
                }

                // Historical Note: 'fetch:history' was moved to direct HTTP request on /api/chat/:interactionId/messages
                // This case is deprecated and removed.

                default:
                    responseData = {
                        error: `Unknown request type: ${type}`
                    };
            }

            const isSuccess = !responseData.error;

            // Send response back to widget-backend
            await responseQueue.add('response', {
                requestId,
                success: isSuccess,
                data: isSuccess ? responseData : null,
                error: isSuccess ? null : responseData.error
            });

            const duration = Date.now() - startTime;
            logger.info({ requestId, type, duration, success: isSuccess }, '[RequestWorker] Request completed');

            return { success: true };

        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error({ requestId, type, error: error.message, duration }, '[RequestWorker] Request failed');

            // Send error response
            await responseQueue.add('response', {
                requestId,
                success: false,
                error: error.message
            });

            throw error;
        }
    }, {
        connection: bullMqConnection,
        ...bullMqWorkerPresets.standard
    });

    worker.on('failed', async (job, err) => {
        if (!job) {
            logger.error({ error: err.message }, '[RequestWorker] Stalled job failed (no job context)');
            return;
        }
        logger.error({ jobId: job.id, error: err.message, attempt: job.attemptsMade }, '[RequestWorker] Job failed');
    });

    worker.on('error', (err) => {
        logger.error({ err }, '[RequestWorker] Worker error');
    });

    return worker;
}
