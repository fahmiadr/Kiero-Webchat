/**
 * Audit Logs Custom Hooks
 * 
 * TanStack Query hooks for audit log data fetching with proper
 * loading, error, and caching states.
 */
import { useQuery, useInfiniteQuery, useMutation } from '@tanstack/react-query';
import auditLogService from '@/services/auditLogService';
import { toast } from '@/hooks/use-toast';

// === Query Keys ===
export const auditKeys = {
    all: ['audit'],
    stats: (clientId) => [...auditKeys.all, 'stats', { clientId }],
    heatmap: (hours, clientId) => [...auditKeys.all, 'heatmap', { hours, clientId }],
    history: (filters) => [...auditKeys.all, 'history', filters],
    timeline: (minutes) => [...auditKeys.all, 'timeline', { minutes }]
};

// === API Functions ===
const fetchStats = async (clientId) => {
    return auditLogService.getStats(clientId);
};

const fetchHeatmap = async (hours = 24, clientId) => {
    return auditLogService.getHeatmap(hours, clientId);
};

const fetchHistory = async ({ pageParam = 0, filters }) => {
    return auditLogService.getLogs({ pageParam, filters });
};

const downloadLogs = async (filters) => {
    // The service returns a blob
    const blob = await auditLogService.downloadLogs(filters);

    // Create download link
    const url = window.URL.createObjectURL(new Blob([blob]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `audit_logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);

    return true;
};

// === Hooks ===

/**
 * Fetch audit stats (24h summary)
 * @param {string|null} clientId - Optional client filter
 */
export const useAuditStats = (clientId = null) => {
    return useQuery({
        queryKey: auditKeys.stats(clientId),
        queryFn: () => fetchStats(clientId),
        staleTime: 30 * 1000, // 30 seconds
        gcTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: true,
        refetchInterval: 60 * 1000, // Auto-refresh every minute
        select: (data) => ({
            total: data?.last24h?.total ?? 0,
            info: data?.last24h?.info ?? 0,
            warn: data?.last24h?.warn ?? 0,
            error: data?.last24h?.error ?? 0,
            critical: data?.last24h?.critical ?? 0
        })
    });
};

/**
 * Fetch heatmap data
 * @param {number} hours - Hours to fetch (default: 24)
 * @param {string|null} clientId - Optional client filter
 */
export const useAuditHeatmap = (hours = 24, clientId = null) => {
    return useQuery({
        queryKey: auditKeys.heatmap(hours, clientId),
        queryFn: () => fetchHeatmap(hours, clientId),
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: true,
        refetchInterval: 60 * 1000
    });
};

/**
 * Fetch audit history with infinite scroll
 * @param {Object} filters - Filter options
 */
export const useAuditHistory = (filters = {}) => {
    return useInfiniteQuery({
        queryKey: auditKeys.history(filters),
        queryFn: ({ pageParam }) => fetchHistory({ pageParam, filters }),
        initialPageParam: 0,
        getNextPageParam: (lastPage, allPages) => {
            if (!lastPage.pagination?.hasMore) return undefined;
            return allPages.reduce((acc, page) => acc + page.data.length, 0);
        },
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false // Don't refetch history on focus
    });
};

/**
 * Download logs mutation
 */
export const useAuditDownload = () => {
    return useMutation({
        mutationFn: downloadLogs,
        onMutate: () => {
            toast({
                title: "Exporting CSV",
                description: "Preparing your audit logs download...",
            });
        },
        onSuccess: () => {
            toast({
                title: "Download Started",
                description: "Your CSV file has been generated successfully.",
            });
        },
        onError: () => {
            toast({
                variant: "destructive",
                title: "Export Failed",
                description: "Could not download audit logs. Please try again.",
            });
        }
    });
};