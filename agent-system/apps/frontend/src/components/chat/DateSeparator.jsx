import React, { useRef, useState, useEffect } from 'react';

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
                root: root // Use specific scroll container as root
            }
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
                className="w-full h-px -mb-px pointer-events-none opacity-0"
                aria-hidden="true"
            />

            <div
                className={`sticky top-2 z-50 flex justify-center pointer-events-none transition-opacity duration-500 ease-in-out ${compact ? 'my-2' : 'my-4'} ${isVisible ? 'opacity-100' : 'opacity-0'}`}
                data-date-label={label}
            >
                <span className={`bg-slate-800/95 backdrop-blur-sm text-slate-400 font-semibold tracking-wide uppercase rounded-full shadow-sm border border-slate-700/50 pointer-events-auto ${compact ? 'text-[9px] px-2 py-0.5' : 'text-[11px] px-3 py-0.5'}`}>
                    {label}
                </span>
            </div>
        </>
    );
};

export default DateSeparator;
