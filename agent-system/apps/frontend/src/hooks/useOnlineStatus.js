import { useSyncExternalStore } from 'react';

/**
 * Subscribe to online/offline events
 */
const subscribe = (callback) => {
    window.addEventListener('online', callback);
    window.addEventListener('offline', callback);
    return () => {
        window.removeEventListener('online', callback);
        window.removeEventListener('offline', callback);
    };
};

/**
 * Get current online status
 */
const getSnapshot = () => navigator.onLine;

/**
 * Server-side snapshot (assume online)
 */
const getServerSnapshot = () => true;

/**
 * Hook to detect online/offline status
 * Uses useSyncExternalStore for proper React 18 integration
 * 
 * @returns {boolean} true if online, false if offline
 */
export const useOnlineStatus = () => {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};
