import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import './lib/pdfWorker'; // Initialize PDF worker
import { scan } from 'react-scan';


// Force dark mode
document.documentElement.classList.add('dark');

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './lib/reactQuery';
import { idbPersister } from './services/persister';

import { Toaster } from "@/components/ui/toaster"

import { TooltipProvider } from "@/components/ui/tooltip"

if (import.meta.env.DEV) {
  if (!window.__REACT_SCAN_INITIALIZED__) {
    scan({
      enabled: true,
      log: true, // Opsional: munculkan log di konsol
    });
    window.__REACT_SCAN_INITIALIZED__ = true;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: idbPersister,
        dehydrateOptions: {
          // Exclude 'attachment' queries from global sync
          // We manage their persistence manually to prevent specific GC and enable permanent IDB storage
          shouldDehydrateQuery: (query) => {
            const isAttachment = query.queryKey[0] === 'attachment';
            const isSuccess = query.state.status === 'success';
            return !isAttachment && isSuccess;
          }
        }
      }}
    >
      <TooltipProvider delayDuration={300}>
        <App />
        <Toaster />
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} buttonPosition="top-left" />}
      </TooltipProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
)

