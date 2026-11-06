import { io } from 'socket.io-client';
import { config } from '@/config';

// Initialize singleton socket connection
// Using VITE_API_URL but stripping /api if needed, or assuming base URL is same.
// Usually backend is at localhost:3003, so Socket.IO connects to localhost:3003
// config.apiUrl is 'http://localhost:3003/api' which might be issue if socket expects root.
// Let's parse origin from apiUrl.

const getBaseUrl = (url) => {
    try {
        if (!url) return 'http://localhost:3003';

        // Handle relative URLs explicitly if needed, or let catch block handle it
        if (url.startsWith('/')) {
            return typeof window !== 'undefined' ? window.location.origin : url;
        }

        const urlObj = new URL(url);
        return urlObj.origin;
    } catch (e) {
        console.warn('[Socket] Failed to parse API URL, using as-is:', url);
        // Fallback to the provided URL instead of localhost
        // This allows relative paths or partially malformed URLs to be handled by io()
        return url;
    }
};

export const socket = io(getBaseUrl(config.apiUrl), {
    path: import.meta.env.VITE_SOCKET_PATH || '/socket.io/', // Configurable Socket Path
    autoConnect: true,
    reconnection: true,
});
