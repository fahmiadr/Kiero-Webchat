import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { scan } from 'react-scan';
import ChatWidget from './components/ChatWidget';
import { TooltipProvider } from './components/ui/tooltip';
import { ShadowRootContext } from './contexts/ShadowRootContext';

// Import processed CSS using Vite's ?inline suffix
import cssContent from './index.css?inline';

if (import.meta.env.DEV) {
  if (!window.__REACT_SCAN_INITIALIZED__) {
    scan({
      enabled: true,
      log: true, // Opsional: munculkan log di konsol
    });
    window.__REACT_SCAN_INITIALIZED__ = true;
  }
}

/**
 * ShadowWrapper - Encapsulates widget in Shadow DOM for CSS isolation
 */
// eslint-disable-next-line react-refresh/only-export-components
function ShadowWrapper({ children }) {
  const hostRef = useRef(null);
  const [shadowRoot, setShadowRoot] = useState(null);

  // Create a client for TanStack Query
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  // Create shadow root and setup styling once
  useEffect(() => {
    if (hostRef.current && !shadowRoot) {
      const shadow = hostRef.current.attachShadow({ mode: 'open' });

      // Inject processed CSS into shadow DOM
      const style = document.createElement('style');
      style.textContent = cssContent;
      shadow.appendChild(style);

      // Create mount point for React
      const mount = document.createElement('div');
      mount.id = 'lc-widget-root';

      // CRITICAL PERFORMANCE FIX: Prevent events inside Shadow DOM from bubbling up
      // to the host page's React Root or global event listeners.
      // React's e.stopPropagation() only works within its own Synthetic Event
      // hierarchy, native listeners must be stopped at the boundary.
      const stopNativePropagation = (e) => e.stopPropagation();
      const eventsToStop = [
        'keydown',
        'keyup',
        'keypress',
        'input',
        'change',
        'click',
        'mousedown',
        'touchstart',
      ];
      eventsToStop.forEach((eventType) => {
        mount.addEventListener(eventType, stopNativePropagation);
      });

      shadow.appendChild(mount);

      // Create portal mount point for Tooltips/Dialogs etc.
      const portalMount = document.createElement('div');
      portalMount.id = 'lc-widget-portal';
      shadow.appendChild(portalMount);

      setShadowRoot(shadow);
    }
  }, [shadowRoot]);

  const reactRootRef = useRef(null);

  // Render children into shadow DOM once ready
  useEffect(() => {
    if (shadowRoot) {
      const mount = shadowRoot.getElementById('lc-widget-root');
      const portalMount = shadowRoot.getElementById('lc-widget-portal');

      if (mount && portalMount) {
        if (!reactRootRef.current) {
          reactRootRef.current = createRoot(mount);
        }

        // Update the existing root rather than creating a new one
        reactRootRef.current.render(
          <StrictMode>
            <ShadowRootContext.Provider value={portalMount}>
              <QueryClientProvider client={queryClient}>
                <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
                {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={true} />}
              </QueryClientProvider>
            </ShadowRootContext.Provider>
          </StrictMode>,
        );
      }
    }
  }, [shadowRoot, children, queryClient]);

  // Clean up inner React Root when ShadowWrapper is completely unmounted
  useEffect(() => {
    return () => {
      if (reactRootRef.current) {
        setTimeout(() => {
          reactRootRef.current?.unmount();
          reactRootRef.current = null;
        }, 0);
      }
    };
  }, []);

  // Stop event propagation to isolate widget interactions from the host page
  const stopPropagation = (e) => e.stopPropagation();

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Event isolation boundary for Shadow DOM, not interactive
    <div
      ref={hostRef}
      role="presentation"
      style={{ all: 'initial', display: 'block' }}
      onMouseDown={stopPropagation}
      onTouchStart={stopPropagation}
      onClick={stopPropagation}
      onKeyDown={stopPropagation}
      onKeyUp={stopPropagation}
      onChange={stopPropagation}
      onInput={stopPropagation}
    />
  );
}

// =============================================================================
// WIDGET CONFIGURATION
// Extract config from script tag data attributes
// =============================================================================
const script = document.currentScript || document.querySelector('script[data-client-id]');
const urlParams = new URLSearchParams(window.location.search);
const urlClientId = urlParams.get('clientId');

// Required: clientId identifies the tenant/page
// Priority: 1. URL Param (iframe embed) -> 2. Script attribute -> 3. Dev Fallback
const defaultClientId = import.meta.env.DEV ? import.meta.env.VITE_DEV_CLIENT_ID : null;
const clientId = urlClientId || script?.getAttribute('data-client-id') || defaultClientId;

// Backend URL from environment (configured at build time)
const backendUrl = import.meta.env.VITE_WIDGET_BACKEND_URL;

// Validate required configuration
if (!backendUrl) {
  // Configured at build time
}

// Create widget container
const containerId = 'lc-widget-container';
let container = document.getElementById(containerId);

if (!container) {
  container = document.createElement('div');
  container.id = containerId;
  document.body.appendChild(container);
}

// Mount widget with Shadow DOM wrapper
// Safely cache root to prevent duplicating event listeners during Vite HMR Development reloads
if (!container._reactRoot) {
  container._reactRoot = createRoot(container);
}

container._reactRoot.render(
  <ShadowWrapper>
    <ChatWidget backendUrl={backendUrl} clientId={clientId} />
  </ShadowWrapper>,
);
