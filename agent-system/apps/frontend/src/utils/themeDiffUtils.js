/**
 * Utility to compare two nested objects (current theme vs target theme)
 * and return a hierarchical array of specific keys that are different.
 * 
 * @param {Object} current - The active working draft object/block
 * @param {Object} target - The saved or default object/block being reverted to
 * @param {String} componentName - The Human readable component name (e.g. 'Launcher')
 * @param {String} blockName - The Human readable block name (e.g. 'Launcher Button')
 * @returns {Array} Array of formatted string paths representing changed fields
 */
export const getImpactedFields = (current, target, componentName, blockName) => {
    if (!current || !target) return [];

    const impacted = [];

    // Helper for human-readable key transformation
    const formatKey = (key) => {
        // e.g. "backgroundColor" -> "Background Color"
        return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    };

    // Recursive traversal to find differences
    const findDiffs = (obj1, obj2, parentPath = '') => {
        for (const key in obj1) {
            // Avoid prototype pollution or missing keys
            if (Object.prototype.hasOwnProperty.call(obj1, key)) {

                const val1 = obj1[key];
                const val2 = obj2?.[key];

                const currentPath = parentPath ? `${parentPath} > ${formatKey(key)}` : formatKey(key);

                if (typeof val1 === 'object' && val1 !== null && !Array.isArray(val1)) {
                    // It's a nested block
                    findDiffs(val1, val2 || {}, currentPath);
                } else {
                    // Simple value comparison
                    if (val1 !== val2) {
                        impacted.push(currentPath);
                    }
                }
            }
        }
    };

    findDiffs(current, target);

    // Prefix with component taxonomy
    const prefix = blockName ? `${componentName} > ${blockName}` : componentName;
    return impacted.map(field => `${prefix} > ${field}`);
};
