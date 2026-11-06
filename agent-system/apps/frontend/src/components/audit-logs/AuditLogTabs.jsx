import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from "@/lib/utils";
import { Play, Pause, Download } from 'lucide-react';

const AuditLogTabs = memo(({
    activeTab,
    setActiveTab,
    isPaused,
    togglePause,
    clearRealtimeLogs,
    handleDownload,
    isExporting
}) => {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 shrink-0">
            <div className="flex gap-1 bg-slate-900/50 p-0.5 rounded-lg border border-slate-800 w-full sm:w-auto">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveTab('realtime')}
                    className={cn(
                        "flex-1 sm:flex-none sm:w-20 h-7 text-xs cursor-pointer transition-all",
                        activeTab === 'realtime'
                            ? "bg-blue-600 hover:bg-blue-600 text-white"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                    )}
                >
                    Live Tail
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveTab('history')}
                    className={cn(
                        "flex-1 sm:flex-none sm:w-20 h-7 text-xs cursor-pointer transition-all",
                        activeTab === 'history'
                            ? "bg-blue-600 hover:bg-blue-600 text-white"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                    )}
                >
                    History
                </Button>
            </div>

            <div className="flex gap-2">
                {activeTab === 'realtime' && (
                    <>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={togglePause}
                            className={cn(
                                "border-slate-700 cursor-pointer h-8",
                                isPaused ? "text-emerald-400 border-emerald-800" : "text-slate-400"
                            )}
                        >
                            {isPaused ? (
                                <><Play className="h-4 w-4 mr-1" /> Resume</>
                            ) : (
                                <><Pause className="h-4 w-4 mr-1" /> Pause</>
                            )}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearRealtimeLogs}
                            className="text-slate-400 cursor-pointer h-8"
                        >
                            Clear
                        </Button>
                    </>
                )}
                {activeTab === 'history' && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownload}
                        disabled={isExporting}
                        className="border-slate-700 text-slate-400 cursor-pointer h-8"
                    >
                        <Download className="h-4 w-4 mr-1" />
                        {isExporting ? 'Exporting...' : 'Export CSV'}
                    </Button>
                )}
            </div>
        </div>
    );
});

export default AuditLogTabs;
