import React, { forwardRef } from 'react';

/**
 * UnreadDivider - Reusable unread messages indicator for chat interfaces.
 * Shows count of unread messages with visual separator lines.
 * Uses forwardRef to support scroll-to-element functionality.
 * @param {number} count - Number of unread messages
 * @param {boolean} compact - Use smaller sizing for compact UIs
 * @param {string} className - Additional CSS classes
 */
const UnreadDivider = forwardRef(({ count, compact = false, className = '' }, ref) => {
    const displayCount = count > 99 ? '99+' : count;

    return (
        <div
            ref={ref}
            className={`flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-500 ${compact ? 'my-2 gap-2' : 'my-4'} ${className}`}
        >
            <div className="h-px bg-blue-500/30 flex-1" />
            <span className={`bg-blue-500/10 text-blue-400 rounded-full border border-blue-500/20 font-medium whitespace-nowrap ${compact ? 'text-[9px] px-2 py-0.5' : 'text-xs px-3 py-1'}`}>
                {displayCount} Pesan Belum Dibaca
            </span>
            <div className="h-px bg-blue-500/30 flex-1" />
        </div>
    );
});

UnreadDivider.displayName = 'UnreadDivider';

export default UnreadDivider;
