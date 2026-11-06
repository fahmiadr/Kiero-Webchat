/**
 * Signature Service for HMAC Verification
 * 
 * Provides secure signature generation and verification for backend-to-backend
 * communication using HMAC-SHA256.
 */
import crypto from 'crypto';

/**
 * Generates HMAC-SHA256 signature for a payload
 * @param {Object} payload - The data to sign
 * @param {string} secret - The shared secret
 * @returns {string} Hex-encoded signature
 */
export const generateSignature = (payload, secret) => {
    return crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
};

/**
 * Verifies HMAC-SHA256 signature using timing-safe comparison
 * @param {Object} payload - The original payload (without signature)
 * @param {string} signature - The received signature
 * @param {string} secret - The shared secret
 * @returns {boolean} True if signature is valid
 */
export const verifySignature = (payload, signature, secret) => {
    try {
        const expected = generateSignature(payload, secret);

        // Use timing-safe comparison to prevent timing attacks
        if (signature.length !== expected.length) {
            return false;
        }

        return crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expected, 'hex')
        );
    } catch {
        return false;
    }
};

/**
 * Extracts signature from job data and returns clean payload
 * @param {Object} jobData - Full job data including signature
 * @returns {{ payload: Object, signature: string }}
 */
export const extractSignature = (jobData) => {
    const { signature, ...payload } = jobData;
    return { payload, signature };
};
