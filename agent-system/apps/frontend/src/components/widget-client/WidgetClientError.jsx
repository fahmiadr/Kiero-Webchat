import { memo } from 'react';
import { RotateCcw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const WidgetClientError = memo(({ error, onRetry }) => {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="relative">
                <div className="absolute -inset-6 bg-red-500/10 blur-2xl rounded-full" />
                <div className="relative bg-slate-800/50 p-6 rounded-full border-2 border-red-500/30 shadow-lg ring-4 ring-slate-900/50">
                    <AlertCircle className="h-9 w-9 text-red-400" />
                </div>
            </div>

            <div className="space-y-2 max-w-[400px] mx-auto">
                <h3 className="text-xl font-bold text-white tracking-tight">
                    Failed to Load Clients
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed font-medium">
                    We encountered an unexpected error while fetching your widget clients.
                </p>
                {error?.message && (
                    <div className="p-4 bg-red-700/30 border border-red-500/30 rounded-md text-sm text-red-200 font-mono break-all mt-4 shadow-inner">
                        {error.message}
                    </div>
                )}
            </div>

            <Button
                type="button"
                onClick={onRetry}
                variant="outline"
                className="bg-slate-700/40 border-slate-600 hover:bg-slate-700/60 hover:border-slate-500 text-slate-200 hover:text-white gap-2 min-w-[160px] h-11 shadow-xl transition-all duration-200"
            >
                <div className="flex items-center gap-2">
                    <RotateCcw className="h-4 w-4" />
                    <span>Retry Again</span>
                </div>
            </Button>
        </div>
    );
});
