import {
  ArrowDown,
  Bot,
  ChevronDown,
  Clock,
  Headset,
  Loader2,
  Minus,
  Shrink,
  Wifi,
  X,
} from 'lucide-react';
import { memo, useEffect, useReducer, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useChatStore, useIsChatClosed, useIsConnected } from '@/stores/chatStore';
import { useThemeStore } from '@/stores/themeStore';

// Map icon IDs to Lucide components for header buttons
const headerButtonIconMap = {
  minus: Minus,
  x: X,
  'chevron-down': ChevronDown,
  'arrow-down': ArrowDown,
  shrink: Shrink,
};

/**
 * Header - Chat window header
 * Features:
 * - Gradient background with glassmorphism
 * - Bot icon when connected to bot
 * - Agent avatar when connected to human agent
 * - Smart connection status for bot/agent/waiting states
 */
// Dynamic offline messages
const offlineMessages = [
  'Menghubungkan...',
  'Mencoba menyambung kembali...',
  'Periksa koneksi internet Anda',
];

const offlineMsgReducer = (state, action) => {
  if (action === 'NEXT') return (state + 1) % offlineMessages.length;
  if (action === 'RESET') return 0;
  return state;
};

const Header = memo(({ onClose, isMobile }) => {
  const agentInfo = useChatStore((s) => s.agentInfo);
  const connectionType = useChatStore((s) => s.connectionType);
  const isConnected = useIsConnected();
  const isChatClosed = useIsChatClosed();
  const [offlineMsgIndex, dispatchOfflineMsg] = useReducer(offlineMsgReducer, 0);

  // Button interaction state
  const [isBtnHovered, setIsBtnHovered] = useState(false);
  const [isBtnActive, setIsBtnActive] = useState(false);

  // Theme support
  const headerTheme = useThemeStore((s) => s.theme.preChatForm.header);
  const btnCfg = headerTheme.buttonSettings || {};

  const closedInfo = useChatStore((s) => s.closedInfo);

  useEffect(() => {
    if (!isConnected) {
      const timer = setInterval(() => {
        dispatchOfflineMsg('NEXT');
      }, 5000);
      return () => clearInterval(timer);
    }
    dispatchOfflineMsg('RESET');
  }, [isConnected]);

  // Determine display info based on connection type
  const getDisplayInfo = () => {
    if (isChatClosed && closedInfo) {
      return {
        name: closedInfo.name || 'Chat Closed',
        role: closedInfo.role,
      };
    }
    if (connectionType === 'agent' && agentInfo?.name) {
      return {
        name: agentInfo.name,
        role: agentInfo.role || 'Live Agent', // Default role if missing
      };
    }
    if (connectionType === 'waiting') {
      return {
        name: 'Menunggu Agent',
        role: null,
      };
    }
    // Bot - use agentInfo.name (fetched from backend) or generic fallback
    return {
      name: agentInfo?.name || 'Bot',
      role: 'Virtual Assistant',
    };
  };

  const displayInfo = getDisplayInfo();

  // Status Logic based on connectionType
  const getStatusConfig = () => {
    if (!isConnected) {
      return {
        text: offlineMessages[offlineMsgIndex],
        color: 'bg-yellow-400',
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
      };
    }

    if (isChatClosed) {
      return {
        text: 'Sesi Berakhir',
        color: 'bg-neutral-500',
        icon: <Minus className="h-3 w-3" />,
      };
    }

    switch (connectionType) {
      case 'agent':
        return {
          // text: displayInfo.role, // Removed duplicate
          // Let's keep status text as "Terhubung" or similar, and put role under name?
          // Or put role in status text area?
          // User said: "tampilkan role agent di text header"
          // I'll put it under name, and keep status text as "Online" or "Terhubung".
          // Wait, usually header has Name (top), Status (bottom).
          // If I put role in bottom, it replaces "Terhubung dengan Agent".
          // That seems cleaner. "Support Agent" instead of "Terhubung dengan Agent".
          // But status dot color indicates connection.
          text: displayInfo.role || 'Terhubung', // Use role as status text
          color: 'bg-green-400',
          icon: <Wifi className="h-3 w-3" />,
        };
      case 'waiting':
        return {
          text: 'Menunggu agent...',
          color: 'bg-yellow-400',
          icon: <Clock className="h-3 w-3 animate-pulse" />,
        };
      default: // bot
        return {
          text: 'Bot aktif',
          color: 'bg-blue-400',
          icon: <Bot className="h-3 w-3" />,
        };
    }
  };

  const status = getStatusConfig();

  // Resolve button icon
  const ButtonIconComponent = headerButtonIconMap[btnCfg.icon] || Minus;
  const resolvedButtonIcon =
    btnCfg.type === 'custom' && btnCfg.imageUrl ? (
      <img src={btnCfg.imageUrl} alt="Minimize" className="h-5 w-5 rounded-full object-cover" />
    ) : (
      <ButtonIconComponent className="h-5 w-5" />
    );

  return (
    <div
      style={{ background: headerTheme.backgroundColor }}
      className={`flex items-center justify-between px-4 py-3 text-white shadow-md ${isMobile ? 'pt-[max(12px,env(safe-area-inset-top))]' : 'rounded-t-xl'}
        `}
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar className="h-10 w-10 border border-white/20 bg-white/10 shadow-sm backdrop-blur-md">
            {/* Logic for Fallback Icon */}
            <AvatarFallback className="flex h-full w-full items-center justify-center bg-transparent">
              {(() => {
                if (isChatClosed) return <Headset className="h-5 w-5 text-white/90" />;
                if (connectionType === 'agent')
                  return <Headset className="h-5 w-5 text-white/90" />;
                if (connectionType === 'waiting')
                  return <Clock className="h-5 w-5 animate-pulse text-white/90" />;
                return <Bot className="h-5 w-5 text-white/90" />;
              })()}
            </AvatarFallback>
          </Avatar>

          {/* Status Indicator Dot */}
          <span
            className={`absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-blue-600 transition-colors duration-300 ${status.color} ${!isConnected || connectionType === 'waiting' ? 'animate-pulse' : ''}`}
          />
        </div>

        {/* Agent/Chat Info */}
        <div className="flex flex-col">
          <h3 className="font-semibold text-sm leading-tight tracking-wide">{displayInfo.name}</h3>

          {/* Connection Status Text */}
          <div
            className={`flex items-center gap-1.5 font-medium text-[11px] transition-opacity duration-300 ${isConnected ? 'text-blue-100/80' : 'text-yellow-200/90'}
                    `}
          >
            {status.icon}
            <span key={status.text} className={isConnected ? '' : 'animate-fade-in-up'}>
              {status.text}
            </span>
          </div>
        </div>
      </div>

      {/* Minimize Button */}
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            onMouseEnter={() => setIsBtnHovered(true)}
            onMouseLeave={() => {
              setIsBtnHovered(false);
              setIsBtnActive(false);
            }}
            onMouseDown={() => setIsBtnActive(true)}
            onMouseUp={() => setIsBtnActive(false)}
            style={{
              color: btnCfg.color,
              backgroundColor: isBtnActive
                ? btnCfg.activeColor
                : isBtnHovered
                  ? btnCfg.hoverColor
                  : btnCfg.backgroundColor,
            }}
            className="h-8 w-8 rounded-full backdrop-blur-sm transition-all duration-200"
            aria-label="Minimize chat"
          >
            {resolvedButtonIcon}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Minimalkan</TooltipContent>
      </Tooltip>
    </div>
  );
});

export default Header;
