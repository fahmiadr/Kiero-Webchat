import React, { memo } from 'react';
import { Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ThemeBuilderLoadingOverlay = memo(({ isLoading, hasError, onRetry }) => {
    if (!isLoading) return null;

    return (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
            {hasError ? (
                <>
                    <div className="relative">
                        <div className="absolute -inset-4 bg-red-500/10 blur-xl rounded-full" />
                        <div className="relative bg-slate-900 p-4 rounded-full border border-slate-800 shadow-xl">
                            <AlertCircle className="h-10 w-10 text-red-500" />
                        </div>
                    </div>
                    <div className="space-y-2 max-w-md text-center mt-6">
                        <h3 className="text-xl font-semibold text-slate-200">Widget Preview Unavailable</h3>
                        <p className="text-slate-500 text-sm">
                            Tidak dapat memuat widget preview. Pastikan widget-frontend sudah berjalan.
                        </p>
                    </div>
                    <Button
                        onClick={onRetry}
                        variant="outline"
                        className="mt-6 bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200 gap-2 min-w-[140px] shadow-lg hover:shadow-cyan-900/20 transition-all"
                    >
                        <RotateCcw className="h-4 w-4" />
                        Coba Lagi
                    </Button>
                </>
            ) : (
                <>
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
                    <p className="text-slate-300 font-medium">Loading Theme Configuration...</p>
                </>
            )}
        </div>
    );
});

export default ThemeBuilderLoadingOverlay;
