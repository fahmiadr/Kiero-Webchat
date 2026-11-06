import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 1, // 1 minute stale time
            gcTime: 1000 * 60 * 5, // 5 minutes garbage collection time
            retry: 1,
            refetchOnWindowFocus: true,
        },
    },
});
