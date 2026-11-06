import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { config } from '../config/index.js';

// Configuration
const ENCRYPTION_KEY = config.encryptionKey;
const IV_LENGTH = 16; // For AES, this is always 16

/**
 * Encrypts text using AES-256-CBC
 * @param {string} text - The text to encrypt
 * @returns {string} - The encrypted text in hex format (iv:content)
 */
export function encrypt(text) {
    if (!text) return null;
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const key = Buffer.from(ENCRYPTION_KEY, 'hex').length === 32
            ? Buffer.from(ENCRYPTION_KEY, 'hex')
            : crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest(); // Ensure 32 bytes

        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (error) {
        // Let caller handle logging - throw descriptive error
        throw new Error(`Encryption failed: ${error.message}`);
    }
}

/**
 * Decrypts text using AES-256-CBC
 * @param {string} text - The encrypted text (iv:content)
 * @returns {string} - The decrypted text
 */
export function decrypt(text) {
    if (!text) return null;
    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');

        const key = Buffer.from(ENCRYPTION_KEY, 'hex').length === 32
            ? Buffer.from(ENCRYPTION_KEY, 'hex')
            : crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();

        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        // Let caller handle logging - throw descriptive error
        throw new Error(`Decryption failed: ${error.message}`);
    }
}

/**
 * Hashes a plain text string (for API Keys / Passwords)
 * @param {string} text 
 * @returns {Promise<string>}
 */
export async function hash(text) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(text, salt);
}

/**
 * Compares a plain text string with a hash
 * @param {string} text 
 * @param {string} hashed 
 * @returns {Promise<boolean>}
 */
export async function compare(text, hashed) {
    return bcrypt.compare(text, hashed);
}

/**
 * Generates a numeric string of specified length
 * @param {number} length 
 * @returns {string}
 */
export function generateNumericId(length = 12) {
    let result = '';
    const characters = '0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

/**
 * Generates a secure random string (hex)
 * @param {number} bytes 
 * @returns {string}
 */
export function generateRandomString(bytes = 16) {
    return crypto.randomBytes(bytes).toString('hex');
}
