import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getWebSocketService } from '../services/websocket';
import type WebSocketService from '../services/websocket';
import toast from 'react-hot-toast';

interface WebSocketContextType {
  ws: WebSocketService | null;
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
}

const WebSocketContext = createContext<WebSocketContextType>({
  ws: null,
  isConnected: false,
  connectionStatus: 'disconnected'
});

interface WebSocketProviderProps {
  children: ReactNode;
  token?: string;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children, token }) => {
  const [ws, setWs] = useState<WebSocketService | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');

  useEffect(() => {
    // Usar el token del entorno si no se proporciona uno
    const wsToken = token || process.env.NEXT_PUBLIC_WS_TOKEN;
    const websocketService = getWebSocketService(wsToken);
    setWs(websocketService);

    websocketService.onConnect = () => {
      setIsConnected(true);
      setConnectionStatus('connected');
      toast.success('Conectado al servidor', { id: 'ws-connection', duration: 2000 });
    };

    websocketService.onDisconnect = () => {
      setIsConnected(false);
      setConnectionStatus('disconnected');
      toast.error('Desconectado del servidor', { id: 'ws-connection', duration: 2000 });
    };

    websocketService.onError = () => {
      setConnectionStatus('error');
      toast.error('Error de conexión', { id: 'ws-connection', duration: 3000 });
    };

    setConnectionStatus('connecting');
    websocketService.connect().catch(error => {
      console.error('Error al conectar WebSocket:', error);
      setConnectionStatus('error');
    });

    return () => {
      websocketService.disconnect();
    };
  }, [token]);

  return (
    <WebSocketContext.Provider value={{ ws, isConnected, connectionStatus }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket debe usarse dentro de WebSocketProvider');
  }
  return context;
};

export default WebSocketContext;
