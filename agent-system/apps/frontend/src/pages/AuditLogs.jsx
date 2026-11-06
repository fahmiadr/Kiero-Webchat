/**
 * Audit Logs Monitoring Page (v2)
 * 
 * Industry-standard admin dashboard for viewing realtime and historical audit logs.
 * 
 * Features:
 * - TanStack Query for data fetching with proper loading/error states
 * - Real-time activity timeline with minute-level precision
 * - Skeleton loaders to prevent layout shift
 * - Live Tail via Socket.IO
 * - Keyboard shortcuts (/, Space, Esc, j/k)
 * - Infinite scroll for history
 * - Virtualized List for high performance
 * - Paced Socket Updates (10Hz)
 */
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import useAuditLogStore from '@/stores/useAuditLogStore';
import { useAuditStats, useAuditHistory, useAuditDownload } from '@/hooks/useAuditLogs';
import { useAuditLogSocket } from '@/hooks/useAuditLogSocket';
import AuditLogActivityTimeline from '@/components/audit-logs/AuditLogActivityTimeline';
import StatsGrid from '@/components/audit-logs/AuditLogStatsGrid';
import AuditLogHeader from '@/components/audit-logs/AuditLogHeader';
import AuditLogTabs from '@/components/audit-logs/AuditLogTabs';
import AuditLogFilters from '@/components/audit-logs/AuditLogFilters';
import AuditLogList from '@/components/audit-logs/AuditLogList';

// === Main Component ===
const AuditLogs = () => {
    // Zustand store for realtime & Socket.IO
    const {
        realtimeLogs,
        filters,
        isPaused,
        isSubscribed,
        togglePause,
        setFilters,
        clearFilters,
        clearRealtimeLogs
    } = useAuditLogStore();

    // TanStack Query hooks
    const {
        data: stats,
        isLoading: statsLoading,
        isError: statsError,
        refetch: refetchStats,
        dataUpdatedAt: statsUpdatedAt
    } = useAuditStats();

    // Derived Real-time Stats
    const realtimeStats = useMemo(() => {
        if (!stats) return { info: 0, warn: 0, error: 0, critical: 0 };

        const merged = { ...stats };

        // Add realtime logs that are newer than the last stats fetch
        if (realtimeLogs.length > 0 && statsUpdatedAt) {
            const safeThreshold = statsUpdatedAt; // Logs newer than fetch time

            realtimeLogs.forEach(log => {
                const logTime = new Date(log.timestamp).getTime();
                if (logTime > safeThreshold) {
                    const level = (log.level || 'info').toLowerCase();
                    if (merged[level] !== undefined) {
                        merged[level]++;
                    }
                }
            });
        }

        return merged;
    }, [stats, realtimeLogs, statsUpdatedAt]);

    const {
        data: historyData,
        isLoading: historyLoading,
        isError: historyError,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        refetch: refetchHistory
    } = useAuditHistory(filters);
    const downloadMutation = useAuditDownload();

    // UI State
    const [activeTab, setActiveTab] = useState('realtime');
    const [expandedLogId, setExpandedLogId] = useState(null);
    const scrollRef = useRef(null);
    const searchInputRef = useRef(null);

    // Stable Toggle Handler
    const handleToggleLog = useCallback((id) => {
        setExpandedLogId(prev => prev === id ? null : id);
    }, []);

    // Flatten history pages
    const historyLogs = useMemo(() => {
        return historyData?.pages?.flatMap(page => page.data) ?? [];
    }, [historyData]);

    // Display logs based on active tab
    const displayLogs = useMemo(() => {
        if (activeTab === 'realtime') {
            // Reverse for terminal-style (newest at bottom)
            return [...realtimeLogs].reverse();
        }
        return historyLogs;
    }, [activeTab, realtimeLogs, historyLogs]);

    // === Virtualization ===
    const rowVirtualizer = useVirtualizer({
        count: displayLogs.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => 48, // Initial estimate
        overscan: 40,
        getItemKey: (index) => {
            const log = displayLogs[index];
            return log ? (log.id || log.timestamp) : index;
        }
    });

    // === TanStack Pacer - Throttled Flush ===
    // Buffer logs and flush to store at 10Hz (100ms) using TanStack Pacer
    // === Socket Hook ===
    useAuditLogSocket();

    // Auto-scroll to bottom for Realtime tab (if at bottom)
    // For Virtualizer, we might need to handle this manually or using virtualizer properties.
    // Simple approach: When displayLogs length changes, scroll to bottom logic.
    // Note: With virtualizer, "scroll to bottom" means scroll to offset = totalSize.
    useEffect(() => {
        if (activeTab === 'realtime' && scrollRef.current && displayLogs.length > 0) {
            // Check if user was already near bottom or forced scroll
            const viewport = scrollRef.current;
            const isNearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100;

            if (isNearBottom || displayLogs.length < 20) { // Always scroll if few logs
                try {
                    // Use a timeout to allow render cycle to complete and virtualizer to update
                    setTimeout(() => {
                        try {
                            if (displayLogs.length > 0) {
                                rowVirtualizer.scrollToIndex(displayLogs.length - 1);
                            }
                        } catch (e) {
                            // Fallback to basic scroll
                            if (scrollRef.current) {
                                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                            }
                        }
                    }, 0);
                } catch {
                    // Fallback immediately if timeout setup fails (unlikely)
                    viewport.scrollTop = viewport.scrollHeight;
                }
            }
        }
    }, [displayLogs.length, activeTab, rowVirtualizer]);

    // Initial scroll setup
    useEffect(() => {
        if (activeTab === 'realtime' && displayLogs.length > 0) {
            setTimeout(() => {
                try {
                    rowVirtualizer.scrollToIndex(displayLogs.length - 1);
                } catch { /* Virtualizer might not be ready */ }
            }, 50);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            const isInput = ['INPUT', 'TEXTAREA'].includes(e.target.tagName);

            switch (e.key) {
                case '/':
                    if (!isInput) {
                        e.preventDefault();
                        searchInputRef.current?.focus();
                    }
                    break;
                case ' ':
                    if (!isInput && activeTab === 'realtime') {
                        e.preventDefault();
                        togglePause();
                    }
                    break;
                case 'Escape':
                    if (expandedLogId) {
                        setExpandedLogId(null);
                    }
                    if (isInput) e.target.blur();
                    break;
                case 'j':
                    // Navigate to next log (virtualizer makes accessing by index easy log-wise, but visual selection requires state)
                    if (!isInput && displayLogs.length > 0) {
                        e.preventDefault();
                        // Logic needs to find index of currently expanded
                        const currentIdx = displayLogs.findIndex(l => (l.id || l.timestamp) === expandedLogId);
                        const nextIdx = Math.min(currentIdx + 1, displayLogs.length - 1);
                        const nextLog = displayLogs[nextIdx];
                        if (nextLog) {
                            setExpandedLogId(nextLog.id || nextLog.timestamp);
                            rowVirtualizer.scrollToIndex(nextIdx);
                        }
                    }
                    break;
                case 'k':
                    if (!isInput && displayLogs.length > 0) {
                        e.preventDefault();
                        const currentIdx = displayLogs.findIndex(l => (l.id || l.timestamp) === expandedLogId);
                        const prevIdx = Math.max(currentIdx - 1, 0);
                        const prevLog = displayLogs[prevIdx];
                        if (prevLog) {
                            setExpandedLogId(prevLog.id || prevLog.timestamp);
                            rowVirtualizer.scrollToIndex(prevIdx);
                        }
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeTab, expandedLogId, displayLogs, togglePause, rowVirtualizer]);

    // Load more handler for infinite scroll (history)
    // Verify visibility using virtualizer range? Or just simple button
    const handleLoadMore = useCallback(() => {
        if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const handleDownload = () => {
        downloadMutation.mutate(filters);
    };

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 p-2 sm:p-4 gap-2 sm:gap-4 overflow-y-auto md:overflow-hidden">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                <AuditLogHeader isSubscribed={isSubscribed} />
            </motion.div>

            {/* Stats Row */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 shrink-0"
            >
                <StatsGrid
                    stats={realtimeStats}
                    isLoading={statsLoading}
                    isError={statsError}
                    onRetry={refetchStats}
                />
            </motion.div>

            {/* Activity Timeline */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="shrink-0"
            >
                <AuditLogActivityTimeline
                    realtimeLogs={realtimeLogs}
                    isSubscribed={isSubscribed}
                    clientId={filters.clientId}
                    onHourClick={(start, end) => {
                        setActiveTab('history');
                        setFilters({
                            startDate: start.toISOString(),
                            endDate: end.toISOString()
                        });
                    }}
                />
            </motion.div>

            {/* Tabs & Actions */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
            >
                <AuditLogTabs
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    isPaused={isPaused}
                    togglePause={togglePause}
                    clearRealtimeLogs={clearRealtimeLogs}
                    handleDownload={handleDownload}
                    isExporting={downloadMutation.isPending}
                />
            </motion.div>

            {/* Filters (only for History or active filters) */}
            <AnimatePresence>
                {(activeTab === 'history' || filters.level || filters.source || filters.event) && (
                    <motion.div
                        layout
                        key="filters"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                    >
                        <AuditLogFilters
                            activeTab={activeTab}
                            filters={filters}
                            setFilters={setFilters}
                            clearFilters={clearFilters}
                            searchInputRef={searchInputRef}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Virtualized List - The Core Optimization */}
            <motion.div
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.4 }}
                className="flex-1 min-h-0 flex flex-col"
            >
                <AuditLogList
                    activeTab={activeTab}
                    displayLogs={displayLogs}
                    rowVirtualizer={rowVirtualizer}
                    scrollRef={scrollRef}
                    historyError={historyError}
                    historyLoading={historyLoading}
                    historyData={historyData}
                    expandedLogId={expandedLogId}
                    handleToggleLog={handleToggleLog}
                    handleLoadMore={handleLoadMore}
                    hasNextPage={hasNextPage}
                    isFetchingNextPage={isFetchingNextPage}
                    refetchHistory={refetchHistory}
                />
            </motion.div>
        </div>
    );
};

export default AuditLogs;
