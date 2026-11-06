import { useEffect, useRef, useState } from 'react';

/**
 * DateSeparator - Reusable sticky date label for chat interfaces.
 * Combines native CSS sticky positioning with "Smart Hide" behavior.
 *
 * Behavior:
 * 1. Natural Position: Always clear visible (opacity-100).
 * 2. Stuck Position (Pinned): Visible ONLY when scrolling (visible=true).
 * 3. Stuck & Stopped: Fades out (opacity-0) to avoid clutter.
 *
 * @param {string} label - The date label text
 * @param {boolean} compact - Use smaller sizing (optional)
 * @param {boolean} visible - Controls visibility when stuck (passed as isScrolling)
 */
const DateSeparator = ({ label, compact = false, visible = false, root = null }) => {
  const [isStuck, setIsStuck] = useState(false);
  const sentinelRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Check if element is "above" the root's top edge.
        // If rootBounds is null (browser viewport), default to 0.
        const rootTop = entry.rootBounds ? entry.rootBounds.top : 0;
        setIsStuck(!entry.isIntersecting && entry.boundingClientRect.top < rootTop);
      },
      {
        threshold: [1],
        root: root, // Use specific scroll container as root
      },
    );

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => observer.disconnect();
  }, [root]); // Re-create observer if root changes

  if (!label) return null;

  // Visibility Control:
  // If NOT stuck: It's a normal inline label -> Show it.
  // If IS stuck: It's a pinned header -> Only show if user is scrolling (visible=true).
  const isVisible = !isStuck || visible;

  return (
    <>
      {/* Ghost Sentinel: Sits in flow just before the sticky element. 
                When it scrolls out of view (top), we know the sticky element behind it has hit the top edge. 
            */}
      <div
        ref={sentinelRef}
        className="pointer-events-none -mb-px h-px w-full opacity-0"
        aria-hidden="true"
      />

      <div
        className={`pointer-events-none sticky top-2 z-50 flex justify-center transition-opacity duration-700 ease-in-out ${compact ? 'my-1' : 'my-2'} ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        data-date-label={label}
      >
        <span
          className={`pointer-events-auto select-none rounded-full border border-gray-200/80 bg-white/90 font-medium text-gray-500 tracking-wide shadow-sm backdrop-blur-sm ${compact ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1 text-[11px]'}`}
        >
          {label}
        </span>
      </div>
    </>
  );
};

export default DateSeparator;
