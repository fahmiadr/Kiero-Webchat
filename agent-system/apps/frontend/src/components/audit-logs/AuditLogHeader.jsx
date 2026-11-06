import { memo, useState, useEffect } from 'react';
import { Keyboard, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getCurrentTime } from '@/utils/formatUtils';

// Helper Component
const LiveClock = memo(() => {
    const [time, setTime] = useState(getCurrentTime());
    useEffect(() => {
        const timer = setInterval(() => setTime(getCurrentTime()), 1000);
        return () => clearInterval(timer);
    }, []);
    return <span>{time}</span>;
});

const AuditLogHeader = memo(({ isSubscribed }) => {
    return (
        <div
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 shrink-0"
        >
            <div>
                <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent tracking-tight">
                    Audit Logs
                </h1>
                <p className="text-sm text-slate-500">Real-time monitoring & history</p>
            </div>

            <div className="flex items-center gap-4">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-slate-500 hover:text-slate-300">
                            <Keyboard className="h-4 w-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent side="bottom" className="w-auto bg-slate-900 border-slate-700 text-slate-300 p-2 shadow-xl">
                        <div className="text-xs space-y-1">
                            <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-2">Shortcuts</div>
                            <div className="flex items-center justify-between gap-4"><span className="text-slate-400">Search</span> <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-[10px] min-w-[20px] text-center border border-slate-700">/</kbd></div>
                            <div className="flex items-center justify-between gap-4"><span className="text-slate-400">Pause/Resume</span> <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-[10px] min-w-[20px] text-center border border-slate-700">Space</kbd></div>
                            <div className="flex items-center justify-between gap-4"><span className="text-slate-400">Navigate</span> <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-[10px] min-w-[20px] text-center border border-slate-700">j / k</kbd></div>
                        </div>
                    </PopoverContent>
                </Popover>
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "w-2 h-2 rounded-full",
                        isSubscribed ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                    )} />
                    <span className="text-xs text-slate-500">
                        {isSubscribed ? 'Connected' : 'Disconnected'}
                    </span>
                </div>
                {/* Current Time */}
                <div className="hidden sm:flex items-center gap-1.5 text-slate-500 text-xs font-mono">
                    <Clock className="h-3.5 w-3.5" />
                    <LiveClock />
                </div>
            </div>
        </div>
    );
});

export default AuditLogHeader;
