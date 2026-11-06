import { socketService } from '@services/socketService';
import { useChatStore, useIsOpen, useView } from '@stores/chatStore';
import { useThemeStore } from '@stores/themeStore';
import { domAnimation, LazyMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { DEFAULT_THEME_CONFIG } from '@/constants/defaultThemeConfig';
import { IS_PREVIEW } from '@/utils/previewMode';
import ChatWindow from './ChatWindow';
import GlobalErrorBoundary from './GlobalErrorBoundary';
import PreChatForm from './PreChatForm';
import RatingForm from './RatingForm';
import WidgetButton from './WidgetButton';

/**
 * ChatWidget - Main container component
 * Features:
 * - Mobile-first responsive design (fullscreen on mobile, floating on desktop)
 * - Safe-area-inset support for notched devices
 * - Smooth open/close animations
 */
const ChatWidget = ({ backendUrl, clientId }) => {
  const isOpen = useIsOpen();
  const view = useView();
  const openWidget = useChatStore((s) => s.openWidget);
  const closeWidget = useChatStore((s) => s.closeWidget);
  const configError = useChatStore((s) => s.configError);
  const runtimeError = useChatStore((s) => s.runtimeError);
  const [isMobile, setIsMobile] = useState(false);

  // Check for mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initialize socket connection globally (Skip if in Theme Builder preview mode)
  useEffect(() => {
    if (backendUrl && !IS_PREVIEW) {
      socketService.connect(backendUrl, clientId);
    }

    return () => {
      if (!IS_PREVIEW) {
        socketService.disconnect();
      }
    };
  }, [backendUrl, clientId]);

  // In preview mode, send defaults to parent (Theme Builder) on mount
  useEffect(() => {
    if (IS_PREVIEW && window.parent !== window) {
      window.parent.postMessage({ type: 'PREVIEW_DEFAULTS', defaults: DEFAULT_THEME_CONFIG }, '*');
    }
  }, []);

  // Listen for iframe preview messages from Admin Dashboard
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === 'PREVIEW_THEME' && event.data?.theme) {
        useThemeStore.getState().setTheme(event.data.theme);
      } else if (event.data?.type === 'PREVIEW_VIEW' && event.data?.view) {
        if (event.data.view === 'open') {
          useChatStore.getState().openWidget();
        } else {
          useChatStore.getState().closeWidget();
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Read position from dedicated theme store (always populated via deep-merge)
  const launcherButtonTheme = useThemeStore((s) => s.theme.launcher.launcherButton);
  const isLeft = launcherButtonTheme.position === 'bottom-left';

  // Container classes - fullscreen on mobile, floating on desktop
  const positionClasses = isLeft ? 'bottom-5 left-5' : 'bottom-5 right-5';

  const containerClasses = isMobile
    ? 'fixed inset-0 z-[9999] pointer-events-none' // Fullscreen on mobile
    : `fixed ${positionClasses} z-[9999] pointer-events-none`; // Floating on desktop

  // Widget window classes - responsive sizing
  const widgetClasses = isMobile
    ? 'w-full h-full' // Fullscreen on mobile
    : 'w-[380px] h-[600px] flex flex-col justify-end'; // Fixed size, align children to bottom

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <LazyMotion features={domAnimation}>
      <div className={containerClasses}>
        {/* Widget Button - Only show when closed */}
        {!isOpen && !isMobile && (
          <div className="pointer-events-auto">
            <WidgetButton onClick={openWidget} isError={Boolean(configError || runtimeError)} />
          </div>
        )}

        {/* Mobile: Show floating button when closed */}
        {!isOpen && isMobile && (
          <div className={`pointer-events-auto absolute ${isLeft ? 'left-5' : 'right-5'} bottom-5`}>
            <WidgetButton onClick={openWidget} isError={Boolean(configError || runtimeError)} />
          </div>
        )}

        <div
          className={`${widgetClasses} pointer-events-auto animate-slide-up ${isOpen ? '' : 'hidden'}`}
        >
          {/*
          ERROR / NORMAL STATE UI
          GlobalErrorBoundary now acts as the master container for both initialization (configError) and runtime errors.
          */}
          <GlobalErrorBoundary
            onClose={closeWidget}
            isMobile={isMobile}
            backendUrl={backendUrl}
            clientId={clientId}
            configError={configError}
          >
            {view === 'prechat' && (
              <PreChatForm backendUrl={backendUrl} clientId={clientId} isMobile={isMobile} />
            )}

            {view === 'chat' && (
              <ChatWindow
                backendUrl={backendUrl}
                clientId={clientId}
                onClose={closeWidget}
                isMobile={isMobile}
              />
            )}

            {view === 'rating' && (
              <RatingForm
                backendUrl={backendUrl}
                clientId={clientId}
                onClose={closeWidget}
                isMobile={isMobile}
              />
            )}
          </GlobalErrorBoundary>
        </div>
      </div>
    </LazyMotion>
  );
};

export default ChatWidget;
