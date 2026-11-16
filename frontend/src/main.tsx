import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { ApiError } from './api.ts';
import { App } from './App.tsx';
import './styles.css';

/**
 * Meldet die API, dass die YouTube-Verbindung abgelaufen ist, wird der Status neu geladen –
 * so zeigt die Seite „YouTube“ sofort „Neu verbinden“ statt „Verbunden“.
 */
function refreshYoutubeStatusOnExpiry(error: Error): void {
  if (error instanceof ApiError && (error.code === 'youtube_reconnect' || error.code === 'youtube_not_connected')) {
    void queryClient.invalidateQueries({ queryKey: ['youtube', 'status'] });
  }
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: refreshYoutubeStatusOnExpiry }),
  mutationCache: new MutationCache({ onError: refreshYoutubeStatusOnExpiry }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
