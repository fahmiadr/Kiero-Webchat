import { ChevronsDown } from 'lucide-react';
import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * ScrollToBottomFAB - Modern floating action button
 * Features:
 * - Smooth transition between unread/no-unread states
 * - Integrated badge counter with fade animation
 * - Layered design for smooth transitions
 */
const ScrollToBottomFAB = ({ onClick, unreadCount = 0 }) => {
  const hasUnread = unreadCount > 0;

  return (
    <div className="flex justify-center">
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        className={`group pointer-events-auto relative flex h-8 w-8 items-center justify-center rounded-full bg-transparent hover:bg-transparent active:scale-90 ${hasUnread ? 'animate-bounce-subtle' : ''}`}
        aria-label={hasUnread ? `${unreadCount} pesan belum dibaca` : 'Scroll to bottom'}
      >
        {/* Base layer - white background */}
        <span
          className={`absolute inset-0 rounded-full border border-gray-100 bg-white/90 shadow-md backdrop-blur-sm transition-opacity duration-300 ${hasUnread ? 'opacity-0' : 'opacity-100'}`}
        />

        {/* Gradient layer - for unread state */}
        <span
          className={`absolute inset-0 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/40 shadow-lg transition-opacity duration-300 ${hasUnread ? 'opacity-100' : 'opacity-0'}`}
        />

        {/* Icon */}
        <ChevronsDown
          className={`relative z-10 h-4 w-4 transition-all duration-300 group-hover:translate-y-0.5 ${hasUnread ? 'text-white' : 'text-gray-500 group-hover:text-gray-700'}`}
        />

        <Badge
          className={`absolute -top-1.5 -right-1.5 h-[18px] min-w-[18px] ${unreadCount > 99 ? 'px-1' : 'px-0'} pointer-events-none z-20 flex items-center justify-center rounded-full border-[1.5px] border-white bg-gradient-to-r from-red-500 to-rose-500 font-bold text-[9px] text-white leading-none shadow-sm transition-all duration-300 hover:bg-gradient-to-r hover:from-red-500 hover:to-rose-500 ${hasUnread ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </Badge>

        {/* Ripple effect - Blue to match button */}
        <span
          className={`absolute inset-0 rounded-full bg-blue-400 transition-opacity duration-300 ${hasUnread ? 'animate-ripple-slow opacity-20' : 'opacity-0'}`}
        />
      </Button>
    </div>
  );
};

export default memo(ScrollToBottomFAB);
