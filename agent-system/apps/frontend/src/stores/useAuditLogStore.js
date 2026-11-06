/**
 * Audit Log Monitoring Store
 * 
 * Zustand store for managing realtime and historical audit logs.
 * Handles Socket.IO subscription and REST API queries.
 */
import { create } from 'zustand';
import axios from '../lib/axios';

// Maximum logs to keep in memory for Live Tail
const MAX_REALTIME_LOGS = 500;

/**
 * @typedef {Object} AuditLog
 * @property {number} id
 * @property {string} timestamp
 * @property {string} level - INFO, WARN, ERROR, CRITICAL
 * @property {string} source - system, agent, widget, external, queue
 * @property {string} event
 * @property {Object|null} metadata
 * @property {string|null} ip
 * @property {string|null} client_id
 */

const useAuditLogStore = create((set, get) => ({
    // === State ===
    realtimeLogs: [], // Live tail logs
    historyLogs: [],  // Historical query results
    historyTotal: 0,
    historyOffset: 0,
    historyHasMore: true,

    // Filters
    filters: {
        level: null,
        source: null,
        event: '',
        clientId: null,
        startDate: null,
        endDate: null
    },

    // Heatmap data
    heatmapData: [],

    // UI State
    isLoading: false,
    isPaused: false,
    error: null,
    isSubscribed: false,

    // Stats
    stats: {
        total: 0,
        info: 0,
        warn: 0,
        error: 0,
        critical: 0
    },

    // === Socket Actions ===
    /**
     * Subscribe to realtime logs via Socket.IO
     * @param {Socket} socket - Socket.IO instance
     * @param {string} role - User role (must be 'admin')
     */
    subscribeToLogs: (socket, role) => {
        if (get().isSubscribed || !socket) return;

        socket.emit('admin:subscribe_logs', { role });

        socket.on('admin:logs_subscribed', ({ success, error }) => {
            if (success) {
                set({ isSubscribed: true });
            } else {
                set({ error: error || 'Failed to subscribe' });
            }
        });

        // NOTE: We no longer listen to 'log:new' OR 'log:batch' here directly.
        // This is now handled by the UI layer (AuditLogs.jsx) via a Pacer/Buffer
        // to prevent React state trashing.
        // The UI will call `addLogs` action in batches.
    },

    /**
     * Add a batch of logs to the realtime state
     * @param {Array} logs - Array of log objects
     */
    addLogs: (logs) => {
        const { isPaused, realtimeLogs } = get();
        if (isPaused || logs.length === 0) return;

        // Calculate stats updates
        const stats = { ...get().stats };
        logs.forEach(log => {
            stats.total++;
            const level = (log.level || '').toLowerCase();
            if (stats[level] !== undefined) stats[level]++;
        });

        // Add to realtime logs (newest first)
        // We assume logs coming in are roughly chronological, but batch reverse depends on source.
        // Usually socket sends [old, ..., new]. So we reverse to show [new, ..., old]
        // But if 'logs' is just an array we collected, check order.
        // We will assume input is "oldest -> newest", so we reverse it for display.
        const reversed = [...logs].reverse();

        const updated = [...reversed, ...realtimeLogs].slice(0, MAX_REALTIME_LOGS);
        set({ realtimeLogs: updated, stats });
    },

    /**
     * Unsubscribe from realtime logs
     * @param {Socket} socket
     */
    unsubscribeFromLogs: (socket) => {
        if (!socket) return;

        socket.emit('admin:unsubscribe_logs');
        socket.off('log:new');
        socket.off('log:batch');
        socket.off('admin:logs_subscribed');
        set({ isSubscribed: false });
    },

    // === REST API Actions ===
    /**
     * Fetch historical logs with current filters
     * @param {boolean} append - Append to existing or replace
     */
    fetchHistory: async (append = false) => {
        const { filters, historyOffset, historyLogs } = get();
        set({ isLoading: true, error: null });

        try {
            const params = {
                limit: 50,
                offset: append ? historyOffset : 0,
                ...filters
            };

            // Remove null/empty values
            Object.keys(params).forEach(key => {
                if (params[key] === null || params[key] === '') {
                    delete params[key];
                }
            });

            const response = await axios.get('/logs', { params });
            const { data, pagination } = response.data;

            set({
                historyLogs: append ? [...historyLogs, ...data] : data,
                historyTotal: pagination.total,
                historyOffset: append ? historyOffset + data.length : data.length,
                historyHasMore: pagination.hasMore,
                isLoading: false
            });
        } catch (err) {
            set({
                error: err.response?.data?.error || err.message,
                isLoading: false
            });
        }
    },

    /**
     * Fetch heatmap data for visualization
     * @param {number} hours - Hours to fetch (default: 24)
     */
    fetchHeatmap: async (hours = 24) => {
        const { filters } = get();
        set({ isLoading: true });

        try {
            const response = await axios.get('/logs/heatmap', {
                params: { hours, clientId: filters.clientId }
            });

            set({
                heatmapData: response.data.data,
                isLoading: false
            });
        } catch {
            set({ isLoading: false });
        }
    },

    /**
     * Fetch dashboard stats
     */
    fetchStats: async () => {
        const { filters } = get();

        try {
            const response = await axios.get('/logs/stats', {
                params: { clientId: filters.clientId }
            });

            const { last24h } = response.data.data;
            set({
                stats: {
                    total: last24h.total,
                    info: last24h.info,
                    warn: last24h.warn,
                    error: last24h.error,
                    critical: last24h.critical
                }
            });
        } catch {
            // Silent fail for stats
        }
    },

    /**
     * Download logs as CSV
     */
    downloadLogs: async () => {
        const { filters } = get();

        try {
            const params = { ...filters };
            Object.keys(params).forEach(key => {
                if (params[key] === null || params[key] === '') {
                    delete params[key];
                }
            });

            const response = await axios.get('/logs/download', {
                params,
                responseType: 'blob'
            });

            // Create download link
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `audit_logs_${Date.now()}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            set({ error: 'Failed to download logs' });
        }
    },

    // === UI Actions ===
    /**
     * Toggle pause/resume realtime stream
     */
    togglePause: () => {
        set(state => ({ isPaused: !state.isPaused }));
    },

    /**
     * Update filters
     * @param {Partial<filters>} newFilters
     */
    setFilters: (newFilters) => {
        set(state => ({
            filters: { ...state.filters, ...newFilters },
            historyOffset: 0,
            historyHasMore: true
        }));
    },

    /**
     * Clear all filters
     */
    clearFilters: () => {
        set({
            filters: {
                level: null,
                source: null,
                event: '',
                clientId: null,
                startDate: null,
                endDate: null
            },
            historyOffset: 0,
            historyHasMore: true
        });
    },

    /**
     * Clear realtime logs buffer
     */
    clearRealtimeLogs: () => {
        set({ realtimeLogs: [] });
    },

    /**
     * Reset store to initial state
     */
    reset: () => {
        set({
            realtimeLogs: [],
            historyLogs: [],
            historyTotal: 0,
            historyOffset: 0,
            historyHasMore: true,
            filters: {
                level: null,
                source: null,
                event: '',
                clientId: null,
                startDate: null,
                endDate: null
            },
            heatmapData: [],
            isLoading: false,
            isPaused: false,
            error: null,
            isSubscribed: false,
            stats: { total: 0, info: 0, warn: 0, error: 0, critical: 0 }
        });
    }
}));

export default useAuditLogStore;
