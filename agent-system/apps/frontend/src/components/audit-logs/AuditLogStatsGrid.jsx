/**
 * Stats Grid Component
 * 
 * Displays audit log statistics in a grid of cards with consistent styling.
 */
import { memo } from 'react';
import { cn } from "@/lib/utils";
import { RotateCcw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { levelIcons, levelColors } from '@/constants/auditLogs';
import { Card } from "@/components/ui/card";
import { Skeleton, TextSkeleton } from "@/components/ui/skeleton";

// === Style Constants ===
const colorClasses = {
    blue: 'border-blue-500/30 text-blue-400',
    amber: 'border-amber-500/30 text-amber-400',
    red: 'border-red-500/30 text-red-400',
    fuchsia: 'border-fuchsia-500/30 text-fuchsia-400'
};

const bgColorClasses = {
    blue: 'bg-blue-500/10',
    amber: 'bg-amber-500/10',
    red: 'bg-red-500/10',
    fuchsia: 'bg-fuchsia-500/10'
};

/**
 * Individual Stat Card
 */
const StatCard = ({ label, value, icon, color = 'blue', isLoading = false }) => (
    <Card className={cn(
        "bg-slate-900/40 backdrop-blur-sm p-3 h-[76px] transition-all",
        "hover:bg-slate-900/60 hover:border-opacity-50 shadow-none",
        colorClasses[color] || 'border-slate-700'
    )}>
        <div className="flex items-center justify-between">
            <div className="space-y-1">
                <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">{label}</p>
                <div className="h-7 flex items-center">
                    {isLoading ? (
                        <Skeleton className="h-6 w-12 bg-slate-800" />
                    ) : (
                        <p className="text-xl font-bold tabular-nums">
                            {value.toLocaleString()}
                        </p>
                    )}
                </div>
            </div>
            <div className={cn("p-2.5 rounded-lg", bgColorClasses[color] || 'bg-slate-800')}>
                {isLoading ? (
                    <Skeleton className="h-4 w-4 rounded-full bg-slate-700/50" />
                ) : (
                    icon
                )}
            </div>
        </div>
    </Card>
);

/**
 * Error State for Stats Row
 */
const StatsError = ({ message = "Failed to load stats", onRetry }) => (
    <Card className="col-span-4 bg-slate-900/40 border-red-900/30 h-[76px] flex items-center justify-center gap-3 animate-in fade-in duration-300 shadow-none">
        <AlertCircle className="h-5 w-5 text-red-500/50" />
        <span className="text-xs text-red-400">{message}</span>
        {onRetry && (
            <Button
                variant="ghost"
                size="sm"
                onClick={onRetry}
                className="h-6 text-xs text-red-400 hover:text-red-300"
            >
                <RotateCcw className="h-3 w-3 mr-1" />
                Retry
            </Button>
        )}
    </Card>
);

/**
 * Stats Grid Component
 * 
 * @param {Object} stats - Statistics object with info, warn, error, critical counts
 * @param {boolean} isLoading - Loading state
 * @param {boolean} isError - Error state
 * @param {Function} onRetry - Retry callback for error state
 */
const AuditLogStatsGrid = memo(({
    stats = { info: 0, warn: 0, error: 0, critical: 0 },
    isLoading = false,
    isError = false,
    onRetry
}) => {
    // Error state - spans full row
    if (isError) {
        return <StatsError onRetry={onRetry} />;
    }

    // Get icon components from shared constants
    const InfoIcon = levelIcons.INFO;
    const WarnIcon = levelIcons.WARN;
    const ErrorIcon = levelIcons.ERROR;
    const CriticalIcon = levelIcons.CRITICAL;

    return (
        <>
            <StatCard
                label="Info (24h)"
                value={stats.info}
                icon={<InfoIcon className={`h-4 w-4 ${levelColors.INFO.text}`} />}
                color={levelColors.INFO.name}
                isLoading={isLoading}
            />
            <StatCard
                label="Warnings (24h)"
                value={stats.warn}
                icon={<WarnIcon className={`h-4 w-4 ${levelColors.WARN.text}`} />}
                color={levelColors.WARN.name}
                isLoading={isLoading}
            />
            <StatCard
                label="Errors (24h)"
                value={stats.error}
                icon={<ErrorIcon className={`h-4 w-4 ${levelColors.ERROR.text}`} />}
                color={levelColors.ERROR.name}
                isLoading={isLoading}
            />
            <StatCard
                label="Critical (24h)"
                value={stats.critical}
                icon={<CriticalIcon className={`h-4 w-4 ${levelColors.CRITICAL.text}`} />}
                color={levelColors.CRITICAL.name}
                isLoading={isLoading}
            />
        </>
    );
});

export default AuditLogStatsGrid;
export { StatCard, StatsError };
