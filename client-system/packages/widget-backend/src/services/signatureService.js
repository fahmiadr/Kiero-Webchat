/**
 * Request Signing Service for Widget-Backend
 * 
 * Signs all requests sent to agent-backend via queue
 * for authentication and integrity verification.
 */
import crypto from 'crypto';
import { config } from '../config/index.js';

/**
 * Generate HMAC-SHA256 signature for a payload
 * @param {Object} payload - The data to sign
 * @param {string} secret - The signing secret
 * @returns {string} Hex-encoded signature
 */
export function generateSignature(payload, secret = config.webhook.secret) {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto
        .createHmac('sha256', secret)
        .update(data)
        .digest('hex');
}

/**
 * Create a signed request payload
 * @param {string} type - Request type (e.g., 'validate:client')
 * @param {Object} payload - The request data
 * @returns {Object} Signed request with signature and timestamp
 */
export function createSignedRequest(type, payload) {
    const timestamp = Date.now();
    const requestId = crypto.randomUUID();

    const signableData = {
        requestId,
        type,
        payload,
        timestamp
    };

    const signature = generateSignature(signableData);

    return {
        ...signableData,
        signature
    };
}

/**
 * Verify a signature (for use in agent-backend)
 * @param {Object} data - The signed request data
 * @param {string} providedSignature - The signature to verify
 * @param {string} secret - The secret to use for verification
 * @returns {boolean} True if signature is valid
 */
export function verifySignature(data, providedSignature, secret) {
    const { signature, ...signableData } = data;
    const expectedSignature = generateSignature(signableData, secret);

    // Timing-safe comparison to prevent timing attacks
    if (providedSignature.length !== expectedSignature.length) {
        return false;
    }

    return crypto.timingSafeEqual(
        Buffer.from(providedSignature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
    );
}

/**
 * Check if request is not too old (replay attack prevention)
 * @param {number} timestamp - Request timestamp in milliseconds
 * @param {number} maxAge - Maximum age in milliseconds (default: 5 minutes)
 * @returns {boolean} True if timestamp is valid
 */
export function isTimestampValid(timestamp, maxAge = 5 * 60 * 1000) {
    const now = Date.now();
    const age = now - timestamp;
    return age >= 0 && age <= maxAge;
}
