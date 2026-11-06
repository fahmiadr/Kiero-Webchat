import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useThrottledCallback } from '@tanstack/react-pacer';
import useAuditLogStore from '@/stores/useAuditLogStore';
import useAuthStore from '@/stores/useAuthStore';
import { config } from '@/config';

// Singleton socket instance and state to handle Strict Mode
let socketInstance = null;
let subscribersCount = 0;
let disconnectTimeout = null;

const DISCONNECT_GRACE_PERIOD = 2000; // 2 seconds to allow re-navigation or strict mode remount

export const useAuditLogSocket = () => {
    const user = useAuthStore(state => state.user);
    const {
        subscribeToLogs,
        unsubscribeFromLogs,
        addLogs
    } = useAuditLogStore();
    const [isConnected, setIsConnected] = useState(socketInstance?.connected ?? false);

    // Buffer for logs to prevent too many state updates
    const logBufferRef = useRef([]);

    // Throttled flush function (10Hz / 100ms)
    // We use useThrottledCallback to ensure we don't spam the store
    const flushBuffer = useThrottledCallback(
        () => {
            if (logBufferRef.current.length > 0) {
                addLogs(logBufferRef.current);
                logBufferRef.current = [];
            }
        },
        { wait: 100 }
    );

    useEffect(() => {
        // Cancel any pending disconnect if we are mounting
        if (disconnectTimeout) {
            clearTimeout(disconnectTimeout);
            disconnectTimeout = null;
        }

        if (!socketInstance) {
            // Logic to determine Socket URL (Mirroring lib/socket.js)
            let connectionUrl;

            // Derive from API URL
            const apiUrl = config.apiUrl || 'http://localhost:3003';

            try {
                if (apiUrl.startsWith('/')) {
                    connectionUrl = window.location.origin;
                } else {
                    connectionUrl = new URL(apiUrl).origin;
                }
            } catch (e) {
                console.warn('[useAuditLogSocket] Failed to parse API URL, using as-is:', apiUrl);
                connectionUrl = apiUrl;
            }

            const socketPath = import.meta.env.VITE_SOCKET_PATH || '/socket.io';

            socketInstance = io(connectionUrl, {
                path: socketPath,
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                autoConnect: false // We will connect manually
            });
        }

        // Increment subscriber count
        subscribersCount++;

        // Ensure connection
        if (!socketInstance.connected) {
            socketInstance.connect();
        }

        const handleNewLog = (log) => {
            logBufferRef.current.push(log);
            flushBuffer();
        };

        const handleBatchLogs = (logs) => {
            if (Array.isArray(logs)) {
                logBufferRef.current.push(...logs);
                flushBuffer();
            }
        };

        const onConnect = () => {
            console.log('[useAuditLogSocket] Socket connected');
            setIsConnected(true);
            if (user?.role === 'admin') {
                subscribeToLogs(socketInstance, user.role);
            }
        };

        const onDisconnect = () => {
            console.log('[useAuditLogSocket] Socket disconnected');
            setIsConnected(false);
        };

        // Attach listeners
        socketInstance.on('connect', onConnect);
        socketInstance.on('disconnect', onDisconnect);
        socketInstance.on('log:new', handleNewLog);
        socketInstance.on('log:batch', handleBatchLogs);

        // If already connected when mounting (e.g. from previous page or re-mount)
        if (socketInstance.connected) {
            setIsConnected(true);
            // Re-subscribe if needed (idempotent in store usually, but good to ensure)
            if (user?.role === 'admin') {
                subscribeToLogs(socketInstance, user.role);
            }
        }

        return () => {
            subscribersCount--;

            // Remove listeners for this instance
            // Note: In a real singleton with multiple subscribers, we might want to be careful 
            // about removing 'connect' listeners if other components are using them. 
            // But here typically only one component uses this hook at a time.
            // For safety, we keep them until actual disconnect, or we use unique listeners if needed.
            // However, since the handlers depend on 'flushBuffer' which is local, 
            // we MUST remove them to avoid calling stale closures/unmounted components.
            if (socketInstance) {
                socketInstance.off('connect', onConnect);
                socketInstance.off('disconnect', onDisconnect);
                socketInstance.off('log:new', handleNewLog);
                socketInstance.off('log:batch', handleBatchLogs);
                unsubscribeFromLogs(socketInstance);
            }

            // Graceful Disconnect
            if (subscribersCount === 0) {
                disconnectTimeout = setTimeout(() => {
                    if (socketInstance) {
                        console.log('[useAuditLogSocket] Last subscriber left, disconnecting...');
                        socketInstance.disconnect();
                        socketInstance = null;
                        setIsConnected(false);
                    }
                    disconnectTimeout = null;
                }, DISCONNECT_GRACE_PERIOD);
            }
        };
    }, [user, subscribeToLogs, unsubscribeFromLogs, flushBuffer]);

    return {
        isConnected
    };
};
