import { create } from 'zustand';
import axios from 'axios';
import { config } from '@/config';
import api, { injectStore } from '@/lib/axios';

// ──────────────────────────────────────────────────────
// Module-scoped singletons (shared across all store consumers)
// ──────────────────────────────────────────────────────

/** Proactive refresh timer ID */
let refreshTimeout = null;

/** Deduplication: single in-flight checkAuth promise */
let authCheckPromise = null;

/**
 * Deduplication: single in-flight refresh promise.
 *
 * ALL refresh triggers (proactive timer, axios interceptor, storage event)
 * funnel through this single promise. This eliminates the race condition
 * where two independent paths could send the same refreshToken concurrently,
 * causing "Token reuse detected" on the backend.
 */
let activeRefreshPromise = null;

const parseJwt = (token) => {
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch {
        return null;
    }
};

const useAuthStore = create((set, get) => ({
    user: null,
    accessToken: localStorage.getItem('accessToken') || null,
    refreshToken: localStorage.getItem('refreshToken') || null,
    isAuthenticated: false,
    isLoading: true,

    /**
     * Persists tokens to localStorage, schedules proactive refresh timer,
     * and updates Zustand state.
     */
    setTokens: (accessToken, refreshToken) => {
        set({ accessToken, refreshToken });

        if (accessToken) {
            localStorage.setItem('accessToken', accessToken);
        } else {
            localStorage.removeItem('accessToken');
        }

        if (refreshToken) {
            localStorage.setItem('refreshToken', refreshToken);
        } else {
            localStorage.removeItem('refreshToken');
        }

        // ── Schedule proactive refresh ──────────────────────
        // Always clear previous timer to prevent stale closures
        if (refreshTimeout) {
            clearTimeout(refreshTimeout);
            refreshTimeout = null;
        }

        if (accessToken) {
            const decoded = parseJwt(accessToken);
            if (decoded?.exp) {
                const expiresAt = decoded.exp * 1000;
                // Refresh 1 minute before expiry
                const delay = expiresAt - Date.now() - 60_000;

                if (delay > 0) {
                    refreshTimeout = setTimeout(async () => {
                        try {
                            await get().refreshSession();
                        } catch (error) {
                            console.error('[Auth] Proactive refresh failed:', error.message);
                            get().clearAuth();
                        }
                    }, delay);
                }
            }
        }
    },

    /**
     * Refresh the access token using the stored refresh token.
     *
     * Uses a module-scoped `activeRefreshPromise` for deduplication:
     * - If a refresh is already in-flight, all callers piggyback on the
     *   same promise instead of sending duplicate requests.
     * - `navigator.locks` provides cross-tab mutual exclusion so only
     *   one tab performs the actual HTTP call at a time.
     */
    refreshSession: async () => {
        // Dedup: if a refresh is already in-flight, piggyback on it
        if (activeRefreshPromise) return activeRefreshPromise;

        activeRefreshPromise = (async () => {
            try {
                const performRefresh = async () => {
                    const state = get();
                    const currentRefreshToken = state.refreshToken;

                    if (!currentRefreshToken) {
                        throw new Error('No refresh token available');
                    }

                    // Guard: skip if token is still valid for >15s
                    // (another tab might have refreshed it already)
                    if (state.accessToken) {
                        const decoded = parseJwt(state.accessToken);
                        if (decoded && (decoded.exp * 1000 - Date.now() > 15_000)) {
                            return state.accessToken;
                        }
                    }

                    // Raw axios call to avoid interceptor infinite loops
                    const { data } = await axios.post(
                        `${config.apiUrl}/auth/refresh`,
                        { refreshToken: currentRefreshToken },
                        {
                            headers: { 'Content-Type': 'application/json' },
                            withCredentials: true
                        }
                    );

                    get().setTokens(data.accessToken, data.refreshToken);
                    return data.accessToken;
                };

                // Cross-tab mutex via Web Locks API
                if (navigator.locks) {
                    return await navigator.locks.request('auth_refresh', performRefresh);
                }

                return await performRefresh();
            } finally {
                activeRefreshPromise = null;
            }
        })();

        return activeRefreshPromise;
    },

    login: async (email, password) => {
        try {
            const { data } = await api.post('/auth/login', { email, password });

            get().setTokens(data.accessToken, data.refreshToken);
            set({ user: data.user, isAuthenticated: true });

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.error || 'Login failed'
            };
        }
    },

    clearAuth: () => {
        if (refreshTimeout) {
            clearTimeout(refreshTimeout);
            refreshTimeout = null;
        }
        // Reset dedup promise so next attempt starts fresh
        activeRefreshPromise = null;

        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false
        });
    },

    logout: async () => {
        const currentToken = get().accessToken;
        get().clearAuth();

        // Best-effort server logout — skip interceptor to avoid loops
        try {
            await api.post('/auth/logout', null, {
                headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {},
                _skipInterceptor: true
            });
        } catch {
            // Server-side session cleanup is best-effort; client is already logged out
        }
    },

    checkAuth: async () => {
        if (authCheckPromise) return authCheckPromise;

        authCheckPromise = (async () => {
            try {
                set({ isLoading: true });
                const { data } = await api.get('/auth/me');
                set({ user: data.user, isAuthenticated: true, isLoading: false });
            } catch {
                get().clearAuth();
                set({ isLoading: false });
            } finally {
                authCheckPromise = null;
            }
        })();

        return authCheckPromise;
    }
}));

// Inject store reference into axios interceptor (circular dependency resolution)
injectStore(useAuthStore);

// ──────────────────────────────────────────────────────
// Cross-tab synchronisation via localStorage events
// ──────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
        if (event.key !== 'accessToken' && event.key !== 'refreshToken') return;

        const state = useAuthStore.getState();
        const newAccessToken = localStorage.getItem('accessToken');
        const newRefreshToken = localStorage.getItem('refreshToken');

        // Other tab logged out → follow suit
        if (!newAccessToken && !newRefreshToken && state.isAuthenticated) {
            state.clearAuth();
            return;
        }

        // Other tab refreshed tokens → adopt new tokens (skip if refresh in-flight)
        if (newAccessToken && newAccessToken !== state.accessToken && !activeRefreshPromise) {
            state.setTokens(newAccessToken, newRefreshToken);
            if (!state.isAuthenticated) {
                state.checkAuth();
            }
        }
    });
}

export default useAuthStore;
