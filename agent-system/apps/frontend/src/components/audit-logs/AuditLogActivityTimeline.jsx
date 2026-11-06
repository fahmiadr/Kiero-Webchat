/**
 * Activity Timeline Component (v2.2 Pro Max)
 * 
 * High-fidelity visualization of audit activity with seamless realtime updates.
 * - Glassmorphism UI with subtle gradients
 * - Consistent layout matching ActivityTimelineSkeleton
 * - Robust Error/Loading states
 */
import { useMemo, useCallback, memo, useState, useEffect } from 'react';
import { useAuditHeatmap } from '@/hooks/useAuditLogs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { RotateCcw, AlertCircle, Clock, BarChart2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton, TextSkeleton } from "@/components/ui/skeleton";

/**
 * Get bucket severity level
 */
const getSeverityLevel = (bucket) => {
    if (!bucket) return 'empty';
    if (bucket.critical > 0) return 'critical';
    if (bucket.error > 0) return 'error';
    if (bucket.warn > 0) return 'warn';
    if (bucket.count > 0) return 'info';
    return 'empty';
};

/**
 * Get bar gradient classes based on severity
 */
const getBarGradient = (severity) => {
    switch (severity) {
        case 'critical':
            return 'bg-gradient-to-t from-fuchsia-600 to-fuchsia-400 shadow-[0_0_12px_-3px_rgba(217,70,239,0.6)] border-t border-fuchsia-300/30';
        case 'error':
            return 'bg-gradient-to-t from-red-600 to-red-400 shadow-[0_0_12px_-3px_rgba(239,68,68,0.6)] border-t border-red-300/30';
        case 'warn':
            return 'bg-gradient-to-t from-amber-600 to-amber-400 shadow-[0_0_8px_-2px_rgba(251,191,36,0.5)] border-t border-amber-300/30';
        case 'info':
            return 'bg-gradient-to-t from-blue-600 to-blue-400 shadow-[0_0_8px_-2px_rgba(96,165,250,0.5)] border-t border-blue-300/30';
        default:
            return 'bg-slate-800/30';
    }
};

const formatHour = (hour) => `${hour.toString().padStart(2, '0')}:00`;

const getRelativeLabel = (hoursAgo) => {
    if (hoursAgo === 0) return 'Current Hour';
    if (hoursAgo === 1) return '1 hour ago';
    return `${hoursAgo} hours ago`;
};

/**
 * Timeline Component
 */
const AuditLogActivityTimeline = memo(({
    realtimeLogs = [],
    onHourClick,
    isSubscribed = false,
    clientId = null
}) => {
    // Fetch heatmap data
    const {
        data: heatmapData,
        isLoading,
        isError,
        refetch,
        dataUpdatedAt
    } = useAuditHeatmap(24, clientId);

    const [hourlyData, setHourlyData] = useState([]);

    // Web Worker Integration
    useEffect(() => {
        const worker = new Worker(new URL('../../workers/auditWorker.js', import.meta.url), { type: 'module' });

        worker.onmessage = (e) => {
            const { type, payload } = e.data;
            if (type === 'HOURLY_RESULT') {
                setHourlyData(payload);
            }
        };

        // Post data to worker
        worker.postMessage({
            type: 'CALCULATE_HOURLY',
            payload: {
                heatmapData: heatmapData || [], // Ensure array
                realtimeLogs,
                dataUpdatedAt
            }
        });

        return () => {
            worker.terminate();
        };
    }, [heatmapData, realtimeLogs, dataUpdatedAt]);

    // Derived stats (keep lightweight on main thread or move to worker too)
    const maxCount = useMemo(() => Math.max(10, ...hourlyData.map(h => h.count)), [hourlyData]);

    // Stable random heights for skeleton loading state (generated once on mount)
    const skeletonHeights = useMemo(() => Array.from({ length: 24 }, () => {
        const r = Math.random();
        if (r < 0.2) return 4; // "Empty" state
        return Math.floor(Math.random() * 90) + 10; // 10% to 100%
    }), []);

    const handleClick = useCallback((bucket) => {
        if (bucket.count > 0 && onHourClick) onHourClick(new Date(bucket.hourDate), new Date(bucket.hourEnd)); // Parse strings back to dates
    }, [onHourClick]);

    // Error State
    if (isError) return (
        <div className="bg-slate-900/40 backdrop-blur-sm rounded-xl border border-red-900/30 p-4 h-[140px] flex flex-col items-center justify-center gap-2 animate-in fade-in duration-300">
            <AlertCircle className="h-8 w-8 text-red-500/50" />
            <p className="text-sm font-medium text-red-400">Failed to load activity timeline</p>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => refetch()}
                className="h-6 text-xs text-red-400 hover:text-red-300"
            >
                <RotateCcw className="h-3 w-3 mr-1" />
                Retry
            </Button>

        </div>
    );

    return (
        <div className="bg-slate-900/40 backdrop-blur-sm rounded-xl border border-slate-800/60 p-3 sm:p-4 h-[120px] sm:h-[140px] flex flex-col relative overflow-hidden group/card shadow-sm shrink-0">
            {/* Background Grid Pattern */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiLz48L3N2Zz4=')] opacity-50 pointer-events-none" />

            {/* Header */}
            <div className="flex items-center justify-between mb-3 shrink-0 relative z-10">
                <div className="flex items-center gap-2">
                    {isLoading ? (
                        <>
                            <div className="p-1 rounded bg-slate-800 border border-slate-800/50">
                                <Skeleton className="h-3.5 w-3.5 rounded bg-slate-700/50" />
                            </div>
                            <TextSkeleton text="Activity (24h)" className="text-xs font-semibold bg-slate-800 tracking-wider" />
                            <Skeleton className="ml-2 h-5 w-12 rounded-full bg-slate-800 border border-slate-800/50" />
                        </>
                    ) : (
                        <>
                            <div className="p-1 rounded bg-blue-500/10 border border-blue-500/20">
                                <BarChart2 className="h-3.5 w-3.5 text-blue-400" />
                            </div>
                            <span className="text-xs font-semibold text-slate-300 tracking-wider">
                                <span className="hidden sm:inline">Activity (24h)</span>
                                <span className="sm:hidden">Activity</span>
                            </span>
                        </>
                    )}

                    {!isLoading && isSubscribed && (
                        <span className="ml-2 flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium animate-in fade-in zoom-in duration-300">
                            <span className="relative flex h-2 w-2 items-center justify-center shrink-0">
                                <span className="absolute inset-0 rounded-full bg-emerald-400/75 animate-ping" />
                                <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.4)]" />
                            </span>
                            Live
                        </span>
                    )}
                </div>

                {/* Compact Stats / Legend - Hidden on mobile, shown on sm+ */}
                <div className="hidden sm:flex items-center gap-3 text-[10px] text-slate-500 font-medium">
                    {isLoading ? (
                        <>
                            {["Info", "Warn", "Error", "Critical"].map((text) => (
                                <div key={text} className="flex items-center gap-1.5">
                                    <Skeleton className="h-2 w-2 rounded-sm bg-slate-800" />
                                    <TextSkeleton text={text} className="bg-slate-800 text-[10px] font-medium" />
                                </div>
                            ))}
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-sm bg-blue-500" /> Info
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-sm bg-amber-500" /> Warn
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-sm bg-red-500" /> Error
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-sm bg-fuchsia-500" /> Critical
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Timeline Bars Area */}
            <div className="flex items-end gap-[2px] flex-1 mb-2 relative z-10 mx-[-2px]">
                {isLoading ? (
                    skeletonHeights.map((height, i) => (
                        <Skeleton
                            key={i}
                            className="flex-1 rounded-sm bg-slate-800"
                            style={{
                                height: `${height}%`,
                                animationDelay: `${i * 40}ms`
                            }}
                        />
                    ))
                ) : (
                    hourlyData.map((bucket, idx) => {
                        const severity = getSeverityLevel(bucket);
                        const heightPercent = bucket.count > 0
                            ? Math.max(12, Math.sqrt(bucket.count / maxCount) * 100)
                            : undefined;

                        return (
                            <Tooltip key={idx} delayDuration={300}>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={() => handleClick(bucket)}
                                        disabled={bucket.count === 0}
                                        className={cn(
                                            "flex-1 rounded-sm transition-all duration-300 relative group/bar outline-none",
                                            bucket.count > 0 && "cursor-pointer hover:opacity-100 opacity-90 hover:scale-y-105 origin-bottom",
                                            bucket.count > 0 && getBarGradient(severity),
                                            // Empty bucket styling - increased visibility and interactivity
                                            bucket.count === 0 && "cursor-default opacity-90 bg-slate-700/50 hover:bg-slate-600 hover:opacity-100 h-[5%] hover:h-[20%] transition-[height,background-color,opacity]",
                                            bucket.isCurrent && !bucket.count && "bg-slate-600/50 opacity-60 h-[15%]"
                                        )}
                                        style={heightPercent ? { height: `${heightPercent}%` } : undefined}
                                    >
                                        {bucket.hasRealtimeUpdates && (
                                            <span className="absolute -top-6 left-1/2 -translate-x-1/2 flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 duration-500">
                                                <Zap className="h-3 w-3 text-emerald-400 fill-current drop-shadow-md animate-bounce" />
                                            </span>
                                        )}
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="top"
                                    sideOffset={8}
                                    className="bg-slate-900/95 backdrop-blur-md border-slate-700/50 text-slate-200 text-xs shadow-2xl p-0 rounded-lg overflow-hidden min-w-[160px]"
                                >
                                    <div className="px-3 py-2 bg-slate-800/50 border-b border-slate-700/50 flex justify-between items-center">
                                        <span className="font-semibold text-slate-300">{bucket.label}</span>
                                        <span className="text-[10px] text-slate-500 font-mono">{formatHour(bucket.hour + 1)}</span>
                                    </div>
                                    <div className="p-3 space-y-2">
                                        <div className="flex items-center gap-2 text-slate-400 text-[10px] mb-2">
                                            <Clock className="h-3 w-3" />
                                            {getRelativeLabel(bucket.hoursAgo)}
                                        </div>

                                        {bucket.count === 0 ? (
                                            <div className="text-slate-500 italic text-center py-1">No activity</div>
                                        ) : (
                                            <div className="space-y-1.5">
                                                <div className="flex justify-between items-center pb-1.5 border-b border-slate-700/30">
                                                    <span className="font-medium text-slate-300">Total</span>
                                                    <span className="font-mono font-bold text-white">{bucket.count}</span>
                                                </div>
                                                {bucket.info > 0 && (
                                                    <div className="flex justify-between items-center text-[10px] text-blue-400">
                                                        <span>Info</span>
                                                        <span className="font-mono bg-blue-500/10 px-1.5 rounded">{bucket.info}</span>
                                                    </div>
                                                )}
                                                {bucket.warn > 0 && (
                                                    <div className="flex justify-between items-center text-[10px] text-amber-400">
                                                        <span>Warnings</span>
                                                        <span className="font-mono bg-amber-500/10 px-1.5 rounded">{bucket.warn}</span>
                                                    </div>
                                                )}
                                                {bucket.error > 0 && (
                                                    <div className="flex justify-between items-center text-[10px] text-red-400">
                                                        <span>Errors</span>
                                                        <span className="font-mono bg-red-500/10 px-1.5 rounded">{bucket.error}</span>
                                                    </div>
                                                )}
                                                {bucket.critical > 0 && (
                                                    <div className="flex justify-between items-center text-[10px] text-fuchsia-400">
                                                        <span>Critical</span>
                                                        <span className="font-mono bg-fuchsia-500/10 px-1.5 rounded">{bucket.critical}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        );
                    }))}
            </div>

            {/* Time Labels */}
            <div className="flex justify-between text-[9px] font-medium text-slate-600 px-0.5 tracking-wider uppercase">
                {isLoading ? (
                    <>
                        <TextSkeleton text="24h ago" className="bg-slate-800 text-[9px] font-medium tracking-wider uppercase" />
                        <TextSkeleton text="12h ago" className="bg-slate-800 text-[9px] font-medium tracking-wider uppercase" />
                        <TextSkeleton text="Now" className="bg-slate-800 text-[9px] font-medium tracking-wider uppercase" />
                    </>
                ) : (
                    <>
                        <span>24h ago</span>
                        <span>12h ago</span>
                        <span>Now</span>
                    </>
                )}
            </div>
        </div>
    );
});

export default AuditLogActivityTimeline;
