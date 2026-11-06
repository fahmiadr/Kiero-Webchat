import axios from 'axios';
import { config } from '@/config';

const api = axios.create({
    baseURL: config.apiUrl,
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true // Important for sending/receiving HttpOnly cookies
});

// ──────────────────────────────────────────────────────
// Store injection (avoid circular dependency with useAuthStore)
// ──────────────────────────────────────────────────────
let store;
export const injectStore = (_store) => {
    store = _store;
};

// ──────────────────────────────────────────────────────
// Request Interceptor: Attach Bearer Token
// ──────────────────────────────────────────────────────
api.interceptors.request.use(
    (reqConfig) => {
        const token = store?.getState()?.accessToken;
        if (token) {
            reqConfig.headers.Authorization = `Bearer ${token}`;
        }
        return reqConfig;
    },
    (error) => Promise.reject(error)
);

// ──────────────────────────────────────────────────────
// Response Interceptor: Auto-refresh on 401
//
// SIMPLIFIED: no local isRefreshing / failedQueue mutex.
// All deduplication is handled inside store.refreshSession()
// which uses a single in-flight promise + navigator.locks.
// Concurrent 401s all await the same refreshSession() promise.
// ──────────────────────────────────────────────────────
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Skip interceptor for flagged requests (e.g. logout best-effort call)
        if (originalRequest._skipInterceptor) {
            return Promise.reject(error);
        }

        // Only handle 401 Unauthorized, and only once per request
        if (error.response?.status === 401 && !originalRequest._retry) {
            // If the refresh endpoint itself returned 401, clear auth and bail
            if (originalRequest.url === '/auth/refresh') {
                store?.getState()?.clearAuth();
                return Promise.reject(error);
            }

            originalRequest._retry = true;

            try {
                // Delegate to store — automatically deduplicated
                const newToken = await store?.getState()?.refreshSession();

                // Retry original request with fresh token
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                return api(originalRequest);
            } catch (refreshError) {
                store?.getState()?.clearAuth();
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    }
);

export default api;
