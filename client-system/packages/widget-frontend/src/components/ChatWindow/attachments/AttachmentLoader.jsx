export const AttachmentLoader = () => {
  return (
    <div className="fade-in flex h-full w-full animate-in flex-col items-center justify-center gap-3 bg-black/40 p-4 backdrop-blur-[1px] duration-300">
      {/* Modern Minimal Animation: Bouncing Dots Only */}
      <div className="flex select-none items-center gap-1.5">
        <span className="h-2 w-2 animate-bounce rounded-full bg-white/70 [animation-delay:-0.3s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-white/70 [animation-delay:-0.15s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-white/70" />
      </div>
    </div>
  );
};
