export const AttachmentLoader = () => {
    return (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center w-full h-full gap-3 p-4 bg-neutral-900/50 backdrop-blur-sm animate-in fade-in duration-300">
            {/* Modern Minimal Animation: Bouncing Dots Only */}
            <div className="flex items-center gap-1.5 select-none">
                <span className="w-2 h-2 bg-white/70 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 bg-white/70 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 bg-white/70 rounded-full animate-bounce" />
            </div>
        </div>
    );
};
