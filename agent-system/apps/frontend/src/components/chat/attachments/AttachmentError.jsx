import { RefreshCw } from 'lucide-react';

export const AttachmentError = ({ onRetry }) => {
    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                onRetry?.();
            }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center w-full h-full gap-2 p-2 transition-colors duration-200 cursor-pointer bg-neutral-900/60 backdrop-blur-[1px] animate-in fade-in group/error hover:bg-neutral-900/80"
        >
            <div className="flex items-center justify-center w-10 h-10 transition-colors rounded-full bg-red-500/10 group-hover/error:bg-red-500/20">
                <RefreshCw className="w-5 h-5 text-red-500/90" />
            </div>
            <span className="text-[10px] text-white/60 font-medium text-center leading-tight select-none">
                Gagal memuat<br />Ketuk untuk coba lagi
            </span>
        </button>
    );
};
