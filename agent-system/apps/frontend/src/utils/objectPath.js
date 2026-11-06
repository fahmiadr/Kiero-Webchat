/**
 * Lightweight replacements for lodash.get / lodash.set.
 * Supports dot-notation paths (e.g. "iconSettings.color").
 *
 * @module utils/objectPath
 */

/**
 * Safely reads a nested value from an object using a dot-notation path.
 *
 * @param {Object} obj - Source object to read from.
 * @param {string} path - Dot-separated path (e.g. "a.b.c").
 * @param {*} [defaultValue] - Value returned when the resolved value is undefined.
 * @returns {*} The value at the given path, or defaultValue.
 */
export const getByPath = (obj, path, defaultValue) => {
    if (obj == null || typeof path !== 'string') return defaultValue;

    const keys = path.split('.');
    let result = obj;

    for (const key of keys) {
        if (result == null || typeof result !== 'object') return defaultValue;
        result = result[key];
    }

    return result === undefined ? defaultValue : result;
};

/**
 * Sets a nested value on an object using a dot-notation path.
 * Creates intermediate objects as needed (mutates the target).
 *
 * @param {Object} obj - Target object to mutate.
 * @param {string} path - Dot-separated path (e.g. "a.b.c").
 * @param {*} value - Value to set.
 * @returns {Object} The mutated object (for chaining convenience).
 */
export const setByPath = (obj, path, value) => {
    if (obj == null || typeof path !== 'string') return obj;

    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (current[key] == null || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    }

    current[keys[keys.length - 1]] = value;
    return obj;
};
