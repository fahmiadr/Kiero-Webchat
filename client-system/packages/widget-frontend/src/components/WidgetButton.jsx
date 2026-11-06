import { useUnreadCount } from '@stores/chatStore';
import { useLauncherButtonTheme } from '@stores/themeStore';
import {
  AlertTriangle,
  Headphones,
  HelpCircle,
  MessageCircle,
  MessageCircleMore,
  MessageSquare,
  MessageSquareMore,
  MessageSquareText,
  MessagesSquare,
  Send,
  Smile,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { extractBaseShadowColor } from '@/utils/colorUtils';

// Map icon IDs to Lucide components
const launcherIconMap = {
  'message-square': MessageSquare,
  'message-square-more': MessageSquareMore,
  'message-square-text': MessageSquareText,
  'messages-square': MessagesSquare,
  'message-circle': MessageCircle,
  'message-circle-more': MessageCircleMore,
  headphones: Headphones,
  'help-circle': HelpCircle,
  smile: Smile,
  zap: Zap,
  sparkles: Sparkles,
  send: Send,
};

/**
 * WidgetButton - Floating chat button
 * Features:
 * - Lucide icon for consistent rendering
 * - Pulse animation on unread messages
 * - Gradient background with hover glow
 * - Touch-friendly sizing (64px)
 * - Error state support
 */
const WidgetButton = ({ onClick, isError = false }) => {
  const [isHovered, setIsHovered] = useState(false);
  const unreadCount = useUnreadCount();
  const hasUnread = unreadCount > 0 && !isError;
  const theme = useLauncherButtonTheme();

  const { backgroundColor, hoverColor, pingColor, size } = theme;
  const { type, icon, imageUrl, color: iconColor } = theme.iconSettings || {};

  // Select the appropriate icon component or default to MessageCircle
  const IconComponent = launcherIconMap[icon] || MessageCircle;

  // For badge positioning: if button is on the left, maybe put badge on top-right still.
  // We'll keep it top-right as standard.
  const badgeClasses =
    'pointer-events-none absolute -top-1 -right-1 flex h-[22px] min-w-[22px] animate-bounce items-center justify-center rounded-full border-2 border-white bg-gradient-to-r from-red-500 to-rose-500 px-1.5 font-bold text-white text-xs shadow-md';

  const activeBackground = isHovered && hoverColor ? hoverColor : backgroundColor;
  const baseShadowColor = extractBaseShadowColor(activeBackground, true);
  // Fallback to backgroundColor if pingColor missing
  const activePingColor = pingColor || backgroundColor;

  return (
    <Button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative flex animate-fade-in items-center justify-center rounded-full border-0 p-0 text-white shadow-2xl ring-2 ring-white transition-all duration-300 hover:scale-110 active:scale-95 ${
        isError
          ? 'bg-gradient-to-br from-red-500 to-rose-600 shadow-red-500/40 hover:from-red-600 hover:to-rose-700 hover:shadow-red-500/50'
          : '' // We use inline styles for dynamic colored background
      }
                ${hasUnread ? 'animate-pulse ring-4 ring-blue-400/50' : ''}
            `}
      style={
        isError
          ? { width: size, height: size }
          : {
              width: size,
              height: size,
              background: activeBackground,
              color: iconColor,
              boxShadow: `0 10px 25px -5px #${baseShadowColor}66, 0 8px 10px -6px #${baseShadowColor}66`,
            }
      }
      aria-label={isError ? 'System Status' : 'Open chat'}
    >
      {isError ? (
        <AlertTriangle className="h-7 w-7" strokeWidth={2} />
      ) : type === 'custom' && imageUrl ? (
        <img src={imageUrl} alt="Chat" className="h-7 w-7 rounded-full object-cover" />
      ) : (
        <IconComponent className="h-7 w-7" strokeWidth={2} style={{ color: iconColor }} />
      )}

      {/* Unread badge (Only if no error) */}
      {hasUnread && (
        <Badge className={badgeClasses}>{unreadCount > 99 ? '99+' : unreadCount}</Badge>
      )}

      {/* Pulse ring animation (Only if no error & no unread) */}
      {!hasUnread && !isError && (
        <span
          className="absolute inset-0 animate-ping rounded-full opacity-20"
          style={{ background: activePingColor }}
        />
      )}
    </Button>
  );
};

export default WidgetButton;
