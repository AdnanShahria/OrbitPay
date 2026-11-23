import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DirectionProvider } from '@/components/foundations/direction/direction';
import { Toaster } from '@/components/base/toast/toast';
import App from './App';
import '@/styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root container #root not found in document.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <DirectionProvider locale="en-US">
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster />
      </QueryClientProvider>
    </DirectionProvider>
  </React.StrictMode>,
);
