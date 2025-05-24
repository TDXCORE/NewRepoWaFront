import type { AppProps } from 'next/app';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WebSocketProvider } from '../contexts/WebSocketContext';
import { Toaster } from 'react-hot-toast';
import '../styles/globals.css';
import 'react-calendar/dist/Calendar.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider token={process.env.NEXT_PUBLIC_WS_TOKEN}>
        <Component {...pageProps} />
        <Toaster position="top-right" />
      </WebSocketProvider>
    </QueryClientProvider>
  );
}

export default MyApp;