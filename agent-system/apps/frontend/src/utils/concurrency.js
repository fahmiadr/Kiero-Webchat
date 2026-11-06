/**
 * Creates a function that limits the number of concurrent executions.
 * @param {number} limit - Maximum number of concurrent executions
 * @returns {Function} - A runner function that accepts a task generator
 */
export function pLimit(limit) {
    const queue = [];
    let activeCount = 0;

    const next = () => {
        activeCount--;
        if (queue.length > 0) {
            queue.shift()();
        }
    };

    const run = async (fn, resolve, reject) => {
        activeCount++;
        const result = (async () => fn())();
        resolve(result);
        try {
            await result;
        } catch { }
        next();
    };

    const enqueue = (fn, resolve, reject) => {
        queue.push(run.bind(null, fn, resolve, reject));
        if (activeCount < limit && queue.length > 0) {
            queue.shift()();
        }
    };

    const generator = (fn) => new Promise((resolve, reject) => {
        enqueue(fn, resolve, reject);
    });

    return generator;
}
