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
  // Propiedades adicionales que puede enviar el backend corregido
  users?: User;
  user?: User;
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

  constructor(private token?: string) {
    console.log('🔍 DEBUG - WebSocketService constructor');
    console.log('🔍 DEBUG - Token recibido:', token ? `${token.substring(0, 20)}...` : 'undefined');
  }

  private getDefaultWebSocketUrl(): string {
    console.log('🔍 DEBUG - Obteniendo URL de WebSocket...');
    console.log('🔍 DEBUG - process.env.NEXT_PUBLIC_WS_URL:', process.env.NEXT_PUBLIC_WS_URL);
    console.log('🔍 DEBUG - typeof window:', typeof window);
    
    // Usar la URL del entorno si está disponible
    if (process.env.NEXT_PUBLIC_WS_URL) {
      console.log('✅ DEBUG - Usando URL del entorno:', process.env.NEXT_PUBLIC_WS_URL);
      return process.env.NEXT_PUBLIC_WS_URL;
    }

    if (typeof window === 'undefined') {
      console.log('⚠️ DEBUG - Window undefined, usando localhost');
      return 'ws://localhost:8000/ws';
    }

    // Para desarrollo local, usar localhost:8000
    if (window.location.host.includes('localhost')) {
      const finalUrl = 'ws://localhost:8000/ws';
      console.log('🔍 DEBUG - Desarrollo local, usando:', finalUrl);
      return finalUrl;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const finalUrl = `${protocol}//${host}/ws`;
    
    console.log('🔍 DEBUG - window.location.protocol:', window.location.protocol);
    console.log('🔍 DEBUG - window.location.host:', window.location.host);
    console.log('🔍 DEBUG - protocol calculado:', protocol);
    console.log('🔍 DEBUG - host calculado:', host);
    console.log('🔍 DEBUG - URL final calculada:', finalUrl);
    
    return finalUrl;
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


  // API de Usuarios
  async getUsers(): Promise<{ users: User[] }> {
    return this.send('users', 'get_all_users');
  }

  // API de Conversaciones - Corregida para incluir agent_enabled requerido
  async getConversations(userId?: string): Promise<{ conversations: Conversation[] }> {
    try {
      console.log('🔍 Obteniendo conversaciones con parámetro agent_enabled...');
      
      // El backend requiere el parámetro agent_enabled, obtener ambos tipos
      const [enabledConversations, disabledConversations] = await Promise.allSettled([
        this.send('conversations', 'get_user_conversations', { agent_enabled: true }),
        this.send('conversations', 'get_user_conversations', { agent_enabled: false })
      ]);
      
      let allConversations: Conversation[] = [];
      
      // Procesar conversaciones con agente habilitado
      if (enabledConversations.status === 'fulfilled') {
        const enabled = enabledConversations.value.conversations || [];
        console.log(`✅ Conversaciones con agente habilitado: ${enabled.length}`);
        allConversations.push(...enabled);
      } else {
        console.error('❌ Error obteniendo conversaciones con agente habilitado:', enabledConversations.reason);
      }
      
      // Procesar conversaciones con agente deshabilitado
      if (disabledConversations.status === 'fulfilled') {
        const disabled = disabledConversations.value.conversations || [];
        console.log(`✅ Conversaciones con agente deshabilitado: ${disabled.length}`);
        allConversations.push(...disabled);
      } else {
        console.error('❌ Error obteniendo conversaciones con agente deshabilitado:', disabledConversations.reason);
      }
      
      console.log(`✅ Total conversaciones obtenidas: ${allConversations.length}`);
      
      // Buscar específicamente la conversación mencionada por el usuario
      const targetConversationId = '5db5791a-c545-48e2-a062-ea4ece5917c4';
      const targetConversation = allConversations.find((conv: Conversation) => conv.id === targetConversationId);
      
      if (targetConversation) {
        console.log(`🎯 ¡ENCONTRADA! Conversación objetivo ${targetConversationId}:`, targetConversation);
      } else {
        console.log(`❌ NO ENCONTRADA: Conversación objetivo ${targetConversationId} no está en los resultados`);
        console.log('🔍 IDs de conversaciones disponibles:', allConversations.map((c: Conversation) => c.id));
      }
      
      return { conversations: allConversations };
    } catch (error) {
      console.error('❌ Error obteniendo conversaciones:', error);
      return { conversations: [] };
    }
  }

  // API de Mensajes - Mejorada para obtener todos los mensajes
  async getMessages(conversationId: string, limit: number = 1000, offset: number = 0): Promise<{ messages: Message[] }> {
    try {
      console.log(`🔍 Obteniendo mensajes para conversación ${conversationId} (limit: ${limit}, offset: ${offset})`);
      
      const response = await this.send('messages', 'get_conversation_messages', { 
        conversation_id: conversationId,
        limit,
        offset
      });
      
      const messages = response.messages || [];
      console.log(`✅ Mensajes obtenidos: ${messages.length}`);
      
      if (response.pagination) {
        console.log(`📊 Paginación: ${response.pagination.offset}/${response.pagination.total} (limit: ${response.pagination.limit})`);
        
        // Si hay más mensajes disponibles, advertir
        if (response.pagination.total > messages.length) {
          console.log(`⚠️ ADVERTENCIA: Hay ${response.pagination.total - messages.length} mensajes adicionales disponibles`);
        }
      }
      
      return { messages };
    } catch (error) {
      console.error(`❌ Error obteniendo mensajes para conversación ${conversationId}:`, error);
      return { messages: [] };
    }
  }

  async sendMessage(conversationId: string, content: string, role: 'user' | 'assistant' = 'user'): Promise<{ message: Message }> {
    return this.send('messages', 'send_message', {
      message: {
        conversation_id: conversationId,
        content,
        role
      }
    });
  }

  // API de Dashboard
  async getDashboardStats(dateRange: string = 'today'): Promise<any> {
    return this.send('dashboard', 'get_dashboard_stats', { date_range: dateRange });
  }

  async getConversionFunnel(dateRange: string = 'all'): Promise<any> {
    return this.send('dashboard', 'get_conversion_funnel', { date_range: dateRange });
  }

  async getActivityTimeline(hours: number = 24): Promise<any> {
    return this.send('dashboard', 'get_activity_timeline', { hours });
  }

  async getAgentPerformance(dateRange: string = 'week'): Promise<any> {
    return this.send('dashboard', 'get_agent_performance', { date_range: dateRange });
  }

  async getRealTimeMetrics(): Promise<any> {
    return this.send('dashboard', 'get_real_time_metrics');
  }

  // API de Conversaciones Avanzadas
  async getConversationDetails(conversationId: string): Promise<any> {
    return this.send('conversations', 'get_conversation_with_details', { conversation_id: conversationId });
  }

  async getConversationsByAgentStatus(agentEnabled: boolean, userId?: string): Promise<any> {
    return this.send('conversations', 'get_conversations_by_agent_status', { 
      agent_enabled: agentEnabled,
      user_id: userId 
    });
  }

  async toggleAgentStatus(conversationId: string, enabled: boolean): Promise<any> {
    return this.send('conversations', 'toggle_agent_status', { 
      conversation_id: conversationId,
      enabled 
    });
  }

  async archiveConversation(conversationId: string): Promise<any> {
    return this.send('conversations', 'archive_conversation', { conversation_id: conversationId });
  }

  // API de Meetings
  async getAllMeetings(filter: string = 'all', status?: string, limit: number = 50, offset: number = 0): Promise<any> {
    return this.send('meetings', 'get_all_meetings', { 
      filter, 
      status, 
      limit, 
      offset 
    });
  }

  async getCalendarView(startDate: string, endDate: string): Promise<any> {
    return this.send('meetings', 'get_calendar_view', { 
      start_date: startDate,
      end_date: endDate 
    });
  }

  async createMeeting(meetingData: any): Promise<any> {
    return this.send('meetings', 'create_meeting', { meeting: meetingData });
  }

  async updateMeeting(meetingId: string, meetingData: any): Promise<any> {
    return this.send('meetings', 'update_meeting', { 
      meeting_id: meetingId,
      meeting: meetingData 
    });
  }

  async cancelMeeting(meetingId: string, reason: string = 'Cancelada por el usuario'): Promise<any> {
    return this.send('meetings', 'cancel_meeting', { 
      meeting_id: meetingId,
      reason 
    });
  }

  async getAvailableSlots(date: string, durationMinutes: number = 60): Promise<any> {
    return this.send('meetings', 'get_available_slots', { 
      date,
      duration_minutes: durationMinutes 
    });
  }

  async syncOutlookCalendar(direction: string = 'bidirectional', daysRange: number = 30): Promise<any> {
    return this.send('meetings', 'sync_outlook_calendar', { 
      direction,
      days_range: daysRange 
    });
  }

  // API de Usuarios Avanzada
  async getUsersWithStats(limit: number = 50, offset: number = 0): Promise<any> {
    return this.send('users', 'get_all_with_stats', { limit, offset });
  }

  async getUserProfile(userId: string): Promise<any> {
    return this.send('users', 'get_profile', { user_id: userId });
  }

  async searchUsers(searchTerm: string, limit: number = 50, offset: number = 0): Promise<any> {
    return this.send('users', 'search', { 
      search_term: searchTerm,
      limit,
      offset 
    });
  }

  async createUser(userData: any): Promise<any> {
    return this.send('users', 'create_user', { user: userData });
  }

  async updateUser(userId: string, userData: any): Promise<any> {
    return this.send('users', 'update_user', { 
      user_id: userId,
      user: userData 
    });
  }

  async deleteUser(userId: string): Promise<any> {
    return this.send('users', 'delete_user', { user_id: userId });
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
