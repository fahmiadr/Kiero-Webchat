import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const AttachmentError = ({ onRetry }) => {
  return (
    <Button
      variant="ghost"
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onRetry?.();
      }}
      className="group/error absolute inset-0 z-20 flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-none border-0 bg-black/50 p-0 backdrop-blur-sm transition-colors hover:bg-black/60"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 transition-colors group-hover/error:bg-red-500/20">
        <RefreshCw className="h-5 w-5 text-red-500/90" />
      </div>
      <span className="select-none text-center font-medium text-[10px] text-white/60 leading-tight">
        Gagal memuat
        <br />
        Ketuk untuk coba lagi
      </span>
    </Button>
  );
};
