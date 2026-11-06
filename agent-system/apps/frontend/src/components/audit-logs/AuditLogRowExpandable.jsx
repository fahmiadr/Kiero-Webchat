/**
 * Expandable Log Row Component
 * 
 * Terminal-style log row with inline accordion details.
 * Replaces sidebar approach with expand/collapse per row.
 */
import { memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    ChevronRight,
    ChevronDown,
    Copy,
    ExternalLink,
    Clock,
    Terminal,
    MapPin,
    User,
    Hash,
    Layers,
    Info
} from 'lucide-react';
import { formatLogTimestamp, formatDateTimeFull } from '@/utils/formatUtils';
import { levelIcons, levelStyles, sourceStyles } from '@/constants/auditLogs';
import { copyToClipboard } from '@/utils/clipboard';

/**
 * Helper Component for Detail Fields
 */
const DetailField = ({ icon: Icon, label, children }) => (
    <div className="flex items-start gap-3 py-2">
        <Icon className="h-3.5 w-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide block mb-0.5">{label}</span>
            <div className="text-slate-300 text-xs">{children}</div>
        </div>
    </div>
);

/**
 * Expandable Log Row Component
 */
const AuditLogRowExpandable = memo(({ log, isExpanded, onToggle }) => {
    const LevelIcon = levelIcons[log.level] || Info;
    const isCritical = log.level === 'CRITICAL';

    const handleCopyJson = () => {
        copyToClipboard(JSON.stringify(log, null, 2), 'Log JSON');
    };

    const handleCopyIp = () => {
        if (log.ip) copyToClipboard(log.ip, 'IP Address');
    };

    const handleViewChat = () => {
        if (log.metadata?.interactionId) {
            window.open(`/?chat=${log.metadata.interactionId}`, '_blank');
        }
    };

    return (
        <div className={cn(
            "border-b border-slate-800/40",
            isExpanded ? "bg-slate-950 border-slate-700 shadow-lg relative z-10" : "hover:bg-slate-800/40",
            isCritical && !isExpanded && "animate-pulse"
        )}>
            {/* Main Row - Clickable */}
            <div
                onClick={() => onToggle(log.id || log.timestamp)}
                className={cn(
                    "flex items-center gap-2 px-3 py-2.5 cursor-pointer",
                    isExpanded && "border-l-2 border-l-blue-500 bg-slate-900/50"
                )}
            >
                {/* Expand Icon */}
                <div className="text-slate-500">
                    {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                    )}
                </div>

                {/* Level Icon */}
                <LevelIcon className={cn(
                    "h-4 w-4 flex-shrink-0",
                    log.level === 'INFO' && "text-blue-400",
                    log.level === 'WARN' && "text-amber-400",
                    log.level === 'ERROR' && "text-red-400",
                    log.level === 'CRITICAL' && "text-fuchsia-400"
                )} />

                {/* Source Badge - Hidden on very small screens */}
                <Badge
                    variant="outline"
                    className={cn("hidden sm:inline-flex text-[10px] px-1.5 py-0 h-5", sourceStyles[log.source])}
                >
                    {log.source}
                </Badge>

                {/* Event Name */}
                <span className="text-slate-300 text-xs flex-1 truncate font-medium font-mono">
                    {log.event}
                </span>

                {/* Timestamp - Hidden on mobile, shown in expanded view */}
                <div className="hidden sm:flex items-center gap-1.5 text-slate-400 text-[11px] font-mono tabular-nums flex-shrink-0 px-3">
                    <Clock className="h-3 w-3 text-slate-500" />
                    {formatLogTimestamp(log.timestamp)}
                </div>
            </div>

            {/* Expanded Details Panel */}
            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-1 ml-2 sm:ml-4 border-l border-slate-700/50 bg-slate-900/30">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                                {/* Left Column */}
                                <div className="space-y-1">
                                    <DetailField icon={Clock} label="Timestamp">
                                        <span className="font-mono">{formatDateTimeFull(log.timestamp)}</span>
                                    </DetailField>

                                    <DetailField icon={Hash} label="Level">
                                        <Badge className={cn("text-[10px]", levelStyles[log.level])}>
                                            {log.level}
                                        </Badge>
                                    </DetailField>

                                    <DetailField icon={Terminal} label="Source">
                                        <Badge variant="outline" className={cn("text-[10px]", sourceStyles[log.source])}>
                                            {log.source}
                                        </Badge>
                                    </DetailField>

                                    <DetailField icon={Layers} label="Event">
                                        <span className="font-mono">{log.event}</span>
                                    </DetailField>
                                </div>

                                {/* Right Column */}
                                <div className="space-y-1">
                                    {log.ip && (
                                        <DetailField icon={MapPin} label="IP Address">
                                            <span className="font-mono">{log.ip}</span>
                                        </DetailField>
                                    )}

                                    {log.client_id && (
                                        <DetailField icon={User} label="Client ID">
                                            <span className="font-mono text-[10px] break-all">{log.client_id}</span>
                                        </DetailField>
                                    )}
                                </div>
                            </div>

                            {/* Metadata Section */}
                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                                <div className="mt-3 pt-3 border-t border-slate-700/50">
                                    <span className="text-[10px] text-slate-500 uppercase tracking-wide mb-2 block">Metadata</span>
                                    <pre className="p-3 bg-slate-950/50 rounded-lg border border-slate-800/50 text-slate-400 text-[10px] font-mono overflow-auto max-h-32 leading-relaxed">
                                        {JSON.stringify(log.metadata, null, 2)}
                                    </pre>
                                </div>
                            )}

                            {/* Quick Actions */}
                            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-700/50">
                                {log.metadata?.interactionId && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-[11px] border-slate-700/50 text-slate-400 hover:bg-slate-800/50 cursor-pointer"
                                        onClick={(e) => { e.stopPropagation(); handleViewChat(); }}
                                    >
                                        <ExternalLink className="h-3 w-3 mr-1.5" />
                                        View Chat
                                    </Button>
                                )}

                                {log.ip && log.ip !== '::1' && log.ip !== '127.0.0.1' && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-[11px] border-slate-700/50 text-slate-400 hover:bg-slate-800/50 cursor-pointer"
                                        onClick={(e) => { e.stopPropagation(); handleCopyIp(); }}
                                    >
                                        <MapPin className="h-3 w-3 mr-1.5" />
                                        Copy IP
                                    </Button>
                                )}

                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-[11px] border-slate-700/50 text-slate-400 hover:bg-slate-800/50 cursor-pointer"
                                    onClick={(e) => { e.stopPropagation(); handleCopyJson(); }}
                                >
                                    <Copy className="h-3 w-3 mr-1.5" />
                                    Copy JSON
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});

export default AuditLogRowExpandable;
