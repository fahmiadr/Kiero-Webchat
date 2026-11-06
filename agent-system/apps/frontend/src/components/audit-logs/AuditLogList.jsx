import { RefreshCw, ChevronDown, Radio, Search, AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import AuditLogRowExpandable from '@/components/audit-logs/AuditLogRowExpandable';

// === Skeleton Components (Moved Inline) ===
const LogRowSkeleton = ({ index = 0 }) => (
    <div
        className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-800/50 min-h-[44px]"
        style={{ animationDelay: `${index * 50}ms` }}
    >
        {/* Expand Icon */}
        <Skeleton className="h-3.5 w-3.5 rounded-full shrink-0 bg-slate-800/30" />

        {/* Level Icon */}
        <Skeleton className="h-4 w-4 rounded-sm shrink-0 bg-slate-800/50" />

        {/* Source badge */}
        <Skeleton className="hidden sm:block h-5 w-16 rounded-full shrink-0 bg-slate-800/40" />

        {/* Event Name */}
        <Skeleton className="h-3.5 flex-1 min-w-0 bg-slate-800/50 rounded" />

        {/* Timestamp */}
        <Skeleton className="hidden sm:block h-3 w-28 shrink-0 bg-slate-800/40 rounded" />
    </div>
);

const AuditLogListSkeleton = ({ rows = 10 }) => (
    <div className="animate-in fade-in duration-300">
        {Array.from({ length: rows }).map((_, i) => (
            <LogRowSkeleton key={i} index={i} />
        ))}
    </div>
);

// Helper Components (moved from AuditLogs.jsx)
const EmptyState = ({ message, icon: IconComponent = Search }) => (
    <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-3">
        <IconComponent className="h-8 w-8 text-slate-600" />
        <div className="text-center">
            <p>{message}</p>
            <p className="text-xs text-slate-600 mt-1">
                Try adjusting your filters or wait for new events
            </p>
        </div>
    </div>
);

const ErrorState = ({ message, onRetry, compact = false }) => (
    <div className={cn(
        "flex flex-col items-center justify-center text-red-400 gap-2",
        compact ? "h-[76px]" : "h-48"
    )}>
        <AlertCircle className={`text-red-500/50 ${compact ? "h-5 w-5" : "h-8 w-8"}`} />
        <p className="text-sm font-medium text-red-400">{message}</p>
        {onRetry && (
            <Button variant="ghost" size="sm" onClick={onRetry} className="h-6 text-xs text-red-400 hover:text-red-300">
                <RotateCcw className="h-3 w-3 mr-1" />
                Retry
            </Button>
        )}
    </div>
);

const AuditLogList = ({
    activeTab,
    displayLogs,
    rowVirtualizer,
    scrollRef,
    historyError,
    historyLoading,
    historyData,
    expandedLogId,
    handleToggleLog,
    handleLoadMore,
    hasNextPage,
    isFetchingNextPage,
    refetchHistory
}) => {
    return (
        <div className="flex-1 flex gap-4 min-h-[50vh] md:min-h-0 overflow-hidden">
            <div
                ref={scrollRef}
                className={cn(
                    "flex-1 bg-slate-900/50 rounded-md border overflow-y-auto overflow-x-hidden relative [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:bg-slate-500/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-thumb:hover]:bg-slate-500 [&::-webkit-scrollbar-thumb:hover]:cursor-default [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-clip-content [&::-webkit-scrollbar-thumb]:border-[2px] [&::-webkit-scrollbar-thumb]:border-transparent",
                    activeTab === 'history' && historyError ? "border-red-900/30" : "border-slate-800"
                )}
            >
                {/* Error State - History Tab */}
                {activeTab === 'history' && historyError && !historyLoading && (
                    <div className="h-full min-h-[300px] flex items-center justify-center p-4">
                        <ErrorState
                            message="Failed to load logs"
                            onRetry={refetchHistory}
                        />
                    </div>
                )}

                {/* Loading State - History Tab Initial Load */}
                {activeTab === 'history' && historyLoading && !historyData && (
                    <AuditLogListSkeleton rows={10} />
                )}

                {/* Empty State */}
                {displayLogs.length === 0 && (activeTab === 'realtime' || (!historyLoading && !historyError)) && (
                    <div className="h-full min-h-[300px] flex items-center justify-center p-4">
                        <EmptyState
                            message={activeTab === 'realtime' ? 'Waiting for logs...' : 'No logs to display'}
                            icon={activeTab === 'realtime' ? Radio : Search}
                        />
                    </div>
                )}

                {/* Virtualized Log List - Only render when we have logs */}
                {displayLogs.length > 0 && (
                    <div
                        style={{
                            height: `${rowVirtualizer.getTotalSize()}px`,
                            width: '100%',
                            position: 'relative'
                        }}
                    >
                        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                            const log = displayLogs[virtualItem.index];
                            if (!log) return null;
                            const isExpanded = expandedLogId === (log.id || log.timestamp);

                            return (
                                <div
                                    key={virtualItem.key}
                                    data-index={virtualItem.index}
                                    ref={rowVirtualizer.measureElement}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        transform: `translateY(${virtualItem.start}px)`,
                                        zIndex: isExpanded ? 50 : 0,
                                        contentVisibility: 'auto',
                                        containIntrinsicSize: '48px'
                                    }}
                                >
                                    <AuditLogRowExpandable
                                        log={log}
                                        isExpanded={isExpanded}
                                        onToggle={handleToggleLog}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Load More Button - History Tab */}
                {activeTab === 'history' && hasNextPage && displayLogs.length > 0 && (
                    <div className="h-16 flex items-center justify-center w-full border-t border-slate-800/50">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleLoadMore}
                            disabled={isFetchingNextPage}
                            className="text-slate-400 cursor-pointer"
                        >
                            {isFetchingNextPage ? (
                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <ChevronDown className="h-4 w-4 mr-2" />
                            )}
                            Load More
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuditLogList;
