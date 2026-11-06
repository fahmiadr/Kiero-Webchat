const getEnv = (key, required = true) => {
    const value = import.meta.env[key];
    if (required && !value) {
        throw new Error(`FATAL: Missing required environment variable: ${key}`);
    }
    return value;
};

export const config = {
    apiUrl: getEnv('VITE_API_URL'),
    // Add other env vars here as needed
    // socketUrl: getEnv('VITE_SOCKET_URL'), 
};
