/**
 * HMAC Signature Validation Middleware
 *
 * Protects internal routes (webhook endpoints) that receive data from
 * agent-backend. Verifies X-Widget-Signature + X-Widget-Timestamp headers
 * using the shared WEBHOOK_SECRET.
 *
 * Same signing pattern used by upload.js, history.js, and error.js
 * when they proxy requests TO agent-backend.
 */
import crypto from 'crypto';
import { config } from '../config/index.js';

const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Creates Fastify onRequest hook for HMAC signature validation
 * @param {object} fastify - Fastify instance
 * @returns {Function} Fastify onRequest hook
 */
export const createHmacValidation = (fastify) => {
    return async (request, reply) => {
        const signature = request.headers['x-widget-signature'];
        const timestamp = request.headers['x-widget-timestamp'];
        const ip = request.ip;

        // 1. Require both headers
        if (!signature || !timestamp) {
            fastify.log.warn(
                { ip, url: request.url },
                '[HMAC-Auth] Rejected: Missing signature or timestamp'
            );
            return reply.code(401).send({
                success: false,
                error: {
                    code: 'MISSING_SIGNATURE',
                    message: 'X-Widget-Signature and X-Widget-Timestamp headers are required'
                }
            });
        }

        // 2. Check timestamp freshness (prevent replay attacks)
        const timestampAge = Date.now() - parseInt(timestamp, 10);
        if (Number.isNaN(timestampAge) || timestampAge > MAX_TIMESTAMP_AGE_MS) {
            fastify.log.warn(
                { ip, url: request.url, age: timestampAge },
                '[HMAC-Auth] Rejected: Timestamp expired or invalid'
            );
            return reply.code(401).send({
                success: false,
                error: {
                    code: 'TIMESTAMP_EXPIRED',
                    message: 'Request timestamp is expired or invalid'
                }
            });
        }

        // 3. Verify HMAC signature
        // Format: METHOD:PATH:TIMESTAMP (consistent with upload/history signing)
        const method = request.method;
        const urlPath = new URL(request.url, 'http://localhost').pathname;
        const stringToSign = `${method}:${urlPath}:${timestamp}`;

        const expectedSignature = crypto
            .createHmac('sha256', config.webhook.secret)
            .update(stringToSign)
            .digest('hex');

        if (!crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
        )) {
            fastify.log.warn(
                { ip, url: request.url, method },
                '[HMAC-Auth] Rejected: Invalid signature'
            );
            return reply.code(403).send({
                success: false,
                error: {
                    code: 'INVALID_SIGNATURE',
                    message: 'Request signature verification failed'
                }
            });
        }

        // Signature valid — proceed
        fastify.log.debug({ url: request.url }, '[HMAC-Auth] Signature verified');
    };
};
