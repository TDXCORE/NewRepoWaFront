/**
 * Servicio WebSocket integrado con el backend existente
 */

export interface User {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  company?: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  external_id: string;
  platform: string;
  status: string;
  created_at: string;
  updated_at: string;
  agent_enabled?: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  message_type: string;
  media_url?: string;
  external_id?: string;
  read: boolean;
  created_at: string;
  updated_at: string;
}

class WebSocketService {
  private socket: WebSocket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 1000;
  private messageQueue: any[] = [];
  private eventListeners: { [key: string]: ((data: any) => void)[] } = {};
  private pendingRequests: { [key: string]: { resolve: (data: any) => void; reject: (error: any) => void } } = {};
  
  private callbacks = {
    onConnect: () => {},
    onDisconnect: () => {},
    onError: () => {}
  };

  constructor(private token?: string) {}

  private getDefaultWebSocketUrl(): string {
    // Usar la URL del entorno si está disponible
    if (process.env.NEXT_PUBLIC_WS_URL) {
      return process.env.NEXT_PUBLIC_WS_URL;
    }

    if (typeof window === 'undefined') {
      return 'ws://localhost:8000/ws';
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host.includes('localhost') ? 'localhost:8000' : window.location.host;
    return `${protocol}//${host}/ws`;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket) {
        resolve();
        return;
      }

      try {
        let url = this.getDefaultWebSocketUrl();
        if (this.token) {
          url += (url.includes('?') ? '&' : '?') + `token=${encodeURIComponent(this.token)}`;
        }

        console.log(`🔌 Conectando a WebSocket: ${url}`);
        this.socket = new WebSocket(url);

        this.socket.onopen = () => {
          console.log('✅ Conexión WebSocket establecida');
          this.isConnected = true;
          this.reconnectAttempts = 0;

          while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            this.sendRaw(message);
          }

          this.callbacks.onConnect();
          resolve();
        };

        this.socket.onclose = () => {
          console.log('❌ Conexión WebSocket cerrada');
          this.isConnected = false;
          this.socket = null;
          this.callbacks.onDisconnect();
          this.scheduleReconnect();
        };

        this.socket.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.socket.onerror = (error) => {
          console.error('❌ Error en WebSocket:', error);
          this.callbacks.onError();
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ Máximo número de intentos de reconexión alcanzado`);
      return;
    }

    const delay = this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts);
    
    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch(error => {
        console.error('❌ Error en reconexión:', error);
      });
    }, delay);
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      console.log('📨 Mensaje recibido del servidor:', message);

      switch (message.type) {
        case 'connected':
          this.handleConnectedMessage(message);
          break;
        case 'response':
          this.handleResponse(message);
          break;
        case 'event':
          this.handleEvent(message);
          break;
        case 'error':
          this.handleErrorMessage(message);
          break;
        case 'heartbeat':
          this.handleHeartbeat(message);
          break;
        default:
          console.log(`📋 Mensaje no manejado: ${message.type}`, message);
      }
    } catch (error) {
      console.error('❌ Error al procesar mensaje:', error);
    }
  }

  private handleConnectedMessage(message: any): void {
    console.log('🎯 Mensaje de conexión recibido:', message);
    const payload = message.payload || {};
    
    if (payload.client_id) {
      console.log(`🆔 Cliente ID asignado: ${payload.client_id}`);
    }
    
    if (payload.user_id) {
      console.log(`👤 Usuario ID asignado: ${payload.user_id}`);
    }
    
    // Notificar que la conexión está completamente establecida
    this.callbacks.onConnect();
  }

  private handleHeartbeat(message: any): void {
    console.log('💓 Heartbeat recibido:', message.payload?.timestamp);
    // Los heartbeats mantienen la conexión viva automáticamente
  }

  private handleResponse(message: any): void {
    const requestId = message.id;
    if (requestId && this.pendingRequests[requestId]) {
      const { resolve } = this.pendingRequests[requestId];
      resolve(message.payload);
      delete this.pendingRequests[requestId];
    }
  }

  private handleEvent(message: any): void {
    const eventType = message.payload?.type;
    if (eventType && this.eventListeners[eventType]) {
      this.eventListeners[eventType].forEach(listener => {
        try {
          listener(message.payload.data);
        } catch (error) {
          console.error(`❌ Error en listener de evento ${eventType}:`, error);
        }
      });
    }
  }

  private handleErrorMessage(message: any): void {
    const requestId = message.id;
    
    if (requestId && this.pendingRequests[requestId]) {
      const { reject } = this.pendingRequests[requestId];
      reject(new Error(message.payload.message || 'Error desconocido'));
      delete this.pendingRequests[requestId];
    }
    
    this.callbacks.onError();
  }

  private sendRaw(message: any): boolean {
    if (!this.isConnected || !this.socket) {
      this.messageQueue.push(message);
      return false;
    }

    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      this.messageQueue.push(message);
      return false;
    }
  }

  private send(resource: string, action: string, data: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.socket) {
        reject(new Error('WebSocket no está conectado'));
        return;
      }

      const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const message = {
        type: 'request',
        id: requestId,
        resource,
        payload: {
          action,
          ...data
        }
      };
      
      console.log(`📤 Enviando solicitud: ${resource}.${action}`, message);
      
      // Timeout para requests
      const timeout = setTimeout(() => {
        if (this.pendingRequests[requestId]) {
          delete this.pendingRequests[requestId];
          reject(new Error(`Timeout: No se recibió respuesta para ${resource}.${action}`));
        }
      }, 10000); // 10 segundos timeout
      
      this.pendingRequests[requestId] = { 
        resolve: (data) => {
          clearTimeout(timeout);
          console.log(`📥 Respuesta recibida: ${resource}.${action}`, data);
          resolve(data);
        }, 
        reject: (error) => {
          clearTimeout(timeout);
          console.error(`❌ Error en solicitud: ${resource}.${action}`, error);
          reject(error);
        }
      };
      
      if (!this.sendRaw(message)) {
        clearTimeout(timeout);
        delete this.pendingRequests[requestId];
        reject(new Error('Error enviando mensaje WebSocket'));
      }
    });
  }

  // Método para reintentar usuarios sin conversaciones con timeout extendido
  private async retryUsersWithoutConversations(users: User[]): Promise<Conversation[]> {
    const recoveredConversations: Conversation[] = [];
    
    console.log(`🔄 Reintentando ${users.length} usuarios sin conversaciones con timeout extendido...`);
    
    // Procesar usuarios de uno en uno con timeout extendido
    for (const user of users) {
      try {
        console.log(`🔄 Reintentando usuario: ${user.full_name} (${user.id})`);
        
        // Timeout extendido de 15 segundos para usuarios problemáticos
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Timeout extendido para usuario ${user.full_name}`)), 15000)
        );
        
        const conversationPromise = this.send('conversations', 'get_all', { user_id: user.id });
        const userConversations = await Promise.race([conversationPromise, timeoutPromise]) as any;
        
        if (userConversations.conversations && userConversations.conversations.length > 0) {
          recoveredConversations.push(...userConversations.conversations);
          console.log(`✅ RECUPERADO - Usuario ${user.full_name}: ${userConversations.conversations.length} conversaciones`);
        } else {
          console.log(`📝 Usuario ${user.full_name}: Sin conversaciones confirmado`);
        }
        
        // Pausa entre reintentos para no sobrecargar
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`❌ Error en reintento para usuario ${user.full_name}:`, error);
      }
    }
    
    return recoveredConversations;
  }

  // API de Usuarios
  async getUsers(): Promise<{ users: User[] }> {
    return this.send('users', 'get_all');
  }

  // API de Conversaciones
  async getConversations(userId?: string): Promise<{ conversations: Conversation[] }> {
    if (userId) {
      // Si se proporciona un user_id específico, usarlo directamente
      return this.send('conversations', 'get_all', { user_id: userId });
    } else {
      // Si no se proporciona user_id, obtener conversaciones de todos los usuarios
      try {
        console.log('🔄 Obteniendo conversaciones de TODOS los usuarios...');
        
        // Primero obtener todos los usuarios
        const usersData = await this.getUsers();
        const users = usersData.users || [];
        
        if (users.length === 0) {
          console.log('⚠️ No hay usuarios, devolviendo conversaciones vacías');
          return { conversations: [] };
        }
        
        console.log(`📊 Procesando TODOS los ${users.length} usuarios para obtener todas las conversaciones`);
        
        // Procesar usuarios en lotes más pequeños de 5 para mejor rendimiento
        const batchSize = 5;
        const allConversations: Conversation[] = [];
        let processedUsers = 0;
        
        for (let i = 0; i < users.length; i += batchSize) {
          const batch = users.slice(i, i + batchSize);
          const batchNumber = Math.floor(i/batchSize) + 1;
          const totalBatches = Math.ceil(users.length/batchSize);
          
          console.log(`🔄 Lote ${batchNumber}/${totalBatches} - Procesando usuarios ${i + 1}-${Math.min(i + batchSize, users.length)}`);
          
          // Obtener conversaciones en paralelo para este lote con timeout individual
          const conversationPromises = batch.map(async (user) => {
            try {
              // Timeout individual de 5 segundos por usuario
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`Timeout para usuario ${user.full_name}`)), 5000)
              );
              
              const conversationPromise = this.send('conversations', 'get_all', { user_id: user.id });
              const userConversations = await Promise.race([conversationPromise, timeoutPromise]) as any;
              
              return {
                user,
                conversations: userConversations.conversations || [],
                success: true
              };
            } catch (error) {
              console.warn(`⚠️ Error obteniendo conversaciones para usuario ${user.full_name} (${user.id}):`, error);
              return {
                user,
                conversations: [],
                success: false
              };
            }
          });
          
          const results = await Promise.allSettled(conversationPromises);
          
          results.forEach((result) => {
            if (result.status === 'fulfilled') {
              if (result.value.success && result.value.conversations.length > 0) {
                allConversations.push(...result.value.conversations);
                console.log(`✅ Usuario ${result.value.user.full_name}: ${result.value.conversations.length} conversaciones`);
              } else if (result.value.success) {
                console.log(`📝 Usuario ${result.value.user.full_name}: 0 conversaciones`);
              }
              processedUsers++;
            }
          });
          
          // Progreso de carga
          const progress = Math.round((processedUsers / users.length) * 100);
          console.log(`📊 Progreso: ${progress}% (${processedUsers}/${users.length} usuarios procesados)`);
          
          // Pausa más larga entre lotes para no sobrecargar el servidor
          if (i + batchSize < users.length) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
        
        console.log(`✅ TOTAL CONVERSACIONES OBTENIDAS: ${allConversations.length} de ${users.length} usuarios`);
        
        // Diagnóstico: Verificar qué usuarios no tienen conversaciones
        const usersWithConversations = new Set(allConversations.map(conv => conv.user_id));
        const usersWithoutConversations = users.filter(user => !usersWithConversations.has(user.id));
        
        if (usersWithoutConversations.length > 0) {
          console.warn(`⚠️ USUARIOS SIN CONVERSACIONES DETECTADOS: ${usersWithoutConversations.length}`);
          usersWithoutConversations.forEach(user => {
            console.warn(`   - Usuario: ${user.full_name} (ID: ${user.id})`);
          });
          
          // Intentar recargar usuarios sin conversaciones con timeout extendido
          console.log('🔄 Reintentando carga para usuarios sin conversaciones...');
          const retryResults = await this.retryUsersWithoutConversations(usersWithoutConversations);
          allConversations.push(...retryResults);
          
          console.log(`✅ TOTAL FINAL CONVERSACIONES: ${allConversations.length} (recuperadas: ${retryResults.length})`);
        }
        
        return { conversations: allConversations };
        
      } catch (error) {
        console.error('❌ Error obteniendo conversaciones de todos los usuarios:', error);
        return { conversations: [] };
      }
    }
  }

  // API de Mensajes
  async getMessages(conversationId: string): Promise<{ messages: Message[] }> {
    return this.send('messages', 'get_by_conversation', { conversation_id: conversationId });
  }

  async sendMessage(conversationId: string, content: string, role: 'user' | 'assistant' = 'user'): Promise<{ message: Message }> {
    return this.send('messages', 'create', {
      message: {
        conversation_id: conversationId,
        content,
        role
      }
    });
  }

  // Eventos
  on(eventType: string, listener: (data: any) => void): () => void {
    if (!this.eventListeners[eventType]) {
      this.eventListeners[eventType] = [];
    }
    
    this.eventListeners[eventType].push(listener);
    
    return () => {
      this.off(eventType, listener);
    };
  }

  off(eventType: string, listener: (data: any) => void): void {
    if (this.eventListeners[eventType]) {
      this.eventListeners[eventType] = this.eventListeners[eventType].filter(l => l !== listener);
    }
  }

  // Callbacks
  set onConnect(callback: () => void) { this.callbacks.onConnect = callback; }
  set onDisconnect(callback: () => void) { this.callbacks.onDisconnect = callback; }
  set onError(callback: () => void) { this.callbacks.onError = callback; }

  get connected(): boolean { return this.isConnected; }

  disconnect(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close(1000, 'Cierre normal');
    }
    
    this.isConnected = false;
    this.socket = null;
    this.reconnectAttempts = 0;
    this.messageQueue = [];
  }
}

// Instancia singleton
let wsService: WebSocketService | null = null;

export const getWebSocketService = (token?: string): WebSocketService => {
  if (!wsService) {
    wsService = new WebSocketService(token);
  }
  return wsService;
};

export default WebSocketService;
