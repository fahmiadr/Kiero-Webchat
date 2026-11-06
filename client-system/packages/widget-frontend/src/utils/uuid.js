/**
 * Generate a UUID v4 string.
 * Uses native Web Crypto API when available (HTTPS or localhost).
 * Provides a fallback RFC4122 compliant UUID v4 generator for HTTP or non-secure contexts.
 * 
 * @returns {string} UUID v4 string
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
