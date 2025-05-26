import React, { useEffect, useState, useMemo, useRef } from 'react';
import MainLayout from '../components/Layout/MainLayout';
import { useWebSocket } from '../contexts/WebSocketContext';
import { FiSend, FiUser, FiMessageCircle, FiSearch, FiFilter, FiX, FiCpu, FiArchive, FiInfo, FiRefreshCw } from 'react-icons/fi';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import clsx from 'clsx';
import type { Conversation, Message, User } from '../services/websocket';

interface EnrichedConversation extends Conversation {
  user?: User;
  unreadCount?: number;
  isRecovered?: boolean;
}

interface FilterState {
  searchTerm: string;
  platform: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}

const ChatsPage: React.FC = () => {
  const { ws, isConnected } = useWebSocket();
  const [conversations, setConversations] = useState<EnrichedConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<EnrichedConversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<{ [key: string]: Message[] }>({});
  const [loadingStats, setLoadingStats] = useState({ usersTotal: 0, conversationsTotal: 0, usersWithoutConversations: 0 });
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  
  // Referencia para scroll automático
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Estados de filtros
  const [filters, setFilters] = useState<FilterState>({
    searchTerm: '',
    platform: '',
    status: '',
    dateFrom: '',
    dateTo: ''
  });

  // Función para hacer scroll al final del chat
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Función para formatear timestamp de manera más específica
  const formatSpecificTime = (dateString: string): string => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    const diffInWeeks = Math.floor(diffInMs / (1000 * 60 * 60 * 24 * 7));

    if (diffInMinutes < 1) {
      return 'hace menos de 1 minuto';
    } else if (diffInMinutes < 60) {
      return `hace ${diffInMinutes} minuto${diffInMinutes !== 1 ? 's' : ''}`;
    } else if (diffInHours < 24) {
      return `hace ${diffInHours} hora${diffInHours !== 1 ? 's' : ''}`;
    } else if (diffInDays < 7) {
      return `hace ${diffInDays} día${diffInDays !== 1 ? 's' : ''}`;
    } else {
      return `hace ${diffInWeeks} semana${diffInWeeks !== 1 ? 's' : ''}`;
    }
  };

  // useEffect para scroll automático cuando cambian los mensajes
  useEffect(() => {
    if (messages.length > 0) {
      // Usar setTimeout para asegurar que el DOM se actualice antes del scroll
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [messages.length]); // Solo depender de la cantidad de mensajes, no del array completo

  useEffect(() => {
    if (!ws || !isConnected) return;
    
    // Solo cargar conversaciones una vez al conectar
    loadConversations();
    
    // Configurar listeners para eventos en tiempo real
    console.log('🎧 Configurando listeners de eventos en tiempo real...');
    
    // Listener genérico para capturar TODOS los eventos
    const unsubscribeAllEvents = ws.on('*', (data: any) => {
      console.log('🌐 EVENTO GENÉRICO RECIBIDO:', data);
    });
    
    const unsubscribeNewMessage = ws.on('new_message', (data: any) => {
      console.log('🔔 EVENTO: Nuevo mensaje recibido:', data);
      console.log('🔍 Conversación seleccionada actual:', selectedConversation?.id);
      console.log('🔍 ID de conversación del mensaje:', data.conversation_id);
      
      // Si el mensaje es para la conversación actualmente seleccionada, agregarlo
      if (selectedConversation && data.conversation_id === selectedConversation.id) {
        console.log('✅ Agregando mensaje a la conversación activa');
        setMessages(prev => {
          const newMessages = [...prev, data.message];
          console.log(`📨 Total mensajes después de agregar: ${newMessages.length}`);
          return newMessages;
        });
      } else {
        console.log('ℹ️ Mensaje no es para la conversación activa, solo actualizando contador');
      }
      
      // Actualizar el contador de mensajes no leídos para la conversación y reordenar
      setConversations(prev => {
        const updatedConversations = prev.map(conv => {
          if (conv.id === data.conversation_id) {
            // Solo incrementar si no es la conversación actualmente seleccionada
            const shouldIncrement = !selectedConversation || selectedConversation.id !== data.conversation_id;
            console.log(`📊 Actualizando contador para conversación ${conv.id}, incrementar: ${shouldIncrement}`);
            return {
              ...conv,
              unreadCount: shouldIncrement ? (conv.unreadCount || 0) + 1 : conv.unreadCount,
              updated_at: data.message.created_at || new Date().toISOString()
            };
          }
          return conv;
        });
        
        // Reordenar conversaciones: primero por mensajes no leídos, luego por fecha más reciente
        return updatedConversations.sort((a, b) => {
          // Primero por mensajes no leídos (descendente)
          if ((a.unreadCount || 0) !== (b.unreadCount || 0)) {
            return (b.unreadCount || 0) - (a.unreadCount || 0);
          }
          // Luego por fecha de actualización (descendente - más recientes primero)
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
      });
    });
    
    const unsubscribeMessageUpdated = ws.on('message_updated', (data: any) => {
      console.log('📝 Mensaje actualizado:', data);
      
      // Si es para la conversación actualmente seleccionada, actualizar el mensaje
      if (selectedConversation && data.conversation_id === selectedConversation.id) {
        setMessages(prev => prev.map(msg => 
          msg.id === data.message_id ? { ...msg, ...data.message } : msg
        ));
      }
    });
    
    const unsubscribeMessagesRead = ws.on('messages_read', (data: any) => {
      console.log('👁️ Mensajes marcados como leídos:', data);
      
      // Actualizar contador de no leídos
      setConversations(prev => prev.map(conv => 
        conv.id === data.conversation_id ? { ...conv, unreadCount: 0 } : conv
      ));
      
      // Si es la conversación actualmente seleccionada, marcar mensajes como leídos
      if (selectedConversation && data.conversation_id === selectedConversation.id) {
        setMessages(prev => prev.map(msg => ({ ...msg, read: true })));
      }
    });
    
    // Cleanup function
    return () => {
      unsubscribeAllEvents();
      unsubscribeNewMessage();
      unsubscribeMessageUpdated();
      unsubscribeMessagesRead();
    };
  }, [ws, isConnected]); // Remover selectedConversation de las dependencias para evitar bucles

  // Función para crear conversaciones virtuales para usuarios sin conversaciones
  const createRecoveredConversations = async (usersWithoutConversations: User[]): Promise<EnrichedConversation[]> => {
    const recoveredConversations: EnrichedConversation[] = [];
    
    console.log(`🔄 Creando conversaciones virtuales para ${usersWithoutConversations.length} usuarios...`);
    
    for (const user of usersWithoutConversations) {
      try {
        // Verificar si el usuario tiene mensajes
        console.log(`🔍 Verificando mensajes para usuario: ${user.full_name} (${user.id})`);
        
        // Intentar obtener mensajes directamente por user_id
        // Nota: Esto requiere que el backend soporte buscar mensajes por user_id
        const messagesData = await ws!.getMessages(user.id).catch(() => ({ messages: [] }));
        
        if (messagesData.messages && messagesData.messages.length > 0) {
          console.log(`✅ Usuario ${user.full_name} tiene ${messagesData.messages.length} mensajes - Creando conversación virtual`);
          
          // Crear conversación virtual
          const virtualConversation: EnrichedConversation = {
            id: `virtual-${user.id}`,
            user_id: user.id,
            external_id: `recovered-${user.id}`,
            platform: 'recovered',
            status: 'recovered',
            created_at: messagesData.messages[0]?.created_at || new Date().toISOString(),
            updated_at: messagesData.messages[messagesData.messages.length - 1]?.updated_at || new Date().toISOString(),
            agent_enabled: false,
            user: user,
            isRecovered: true,
            unreadCount: messagesData.messages.filter(msg => !msg.read).length
          };
          
          recoveredConversations.push(virtualConversation);
          
          // Guardar mensajes en cache para esta conversación virtual
          setConversationMessages(prev => ({
            ...prev,
            [virtualConversation.id]: messagesData.messages
          }));
        } else {
          console.log(`📝 Usuario ${user.full_name} no tiene mensajes - No se crea conversación virtual`);
        }
      } catch (error) {
        console.error(`❌ Error verificando mensajes para usuario ${user.full_name}:`, error);
      }
    }
    
    console.log(`✅ Conversaciones virtuales creadas: ${recoveredConversations.length}`);
    return recoveredConversations;
  };

  // Función para contar mensajes no leídos en una conversación
  const getUnreadCount = async (conversationId: string): Promise<number> => {
    try {
      const messagesData = await ws!.getMessages(conversationId);
      return messagesData.messages?.filter(msg => !msg.read).length || 0;
    } catch (error) {
      console.error(`Error contando mensajes no leídos para conversación ${conversationId}:`, error);
      return 0;
    }
  };

  const loadConversations = async () => {
    if (!ws) {
      console.log('⚠️ WebSocket no disponible para cargar conversaciones');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      console.log('🚀 Carga híbrida de conversaciones iniciada...');
      
      // Obtener usuarios primero
      const usersData = await ws.getUsers();
      console.log(`👥 Usuarios obtenidos: ${usersData.users?.length || 0}`);
      
      // Crear mapa de usuarios para búsqueda rápida
      const usersMap = new Map((usersData.users || []).map(user => [user.id, user]));
      
      // Obtener conversaciones usando la nueva estrategia híbrida
      const conversationsData = await ws.getConversations();
      console.log(`💬 Conversaciones obtenidas: ${conversationsData.conversations?.length || 0}`);

      // Enriquecer conversaciones con datos de usuario
      const enrichedConversations: EnrichedConversation[] = (conversationsData.conversations || []).map(conversation => {
        // El backend corregido ahora envía datos de usuario en el campo 'users' o 'user'
        // Priorizar datos del backend si están disponibles, sino usar el mapa local
        const userData = conversation.users || conversation.user || usersMap.get(conversation.user_id);
        
        return {
          ...conversation,
          user: userData,
          isRecovered: false,
          unreadCount: 0 // Inicializar en 0, se cargará en background
        };
      });

      // Ordenar por fecha de actualización (más recientes primero)
      const sortedConversations = enrichedConversations.sort((a, b) => {
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
      
      console.log(`✅ Conversaciones cargadas y ordenadas: ${sortedConversations.length}`);
      setConversations(sortedConversations);
      
      // Cargar contadores de mensajes no leídos en background (sin bloquear la UI)
      loadUnreadCountsInBackground(sortedConversations);
      
      setLoadingStats({
        usersTotal: usersData.users?.length || 0,
        conversationsTotal: enrichedConversations.length,
        usersWithoutConversations: 0
      });
      
    } catch (error) {
      console.error('❌ Error cargando conversaciones:', error);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  };

  // Función para cargar contadores de mensajes no leídos en background
  const loadUnreadCountsInBackground = async (conversations: EnrichedConversation[]) => {
    console.log('🔄 Cargando contadores de mensajes no leídos en background...');
    
    // Procesar en lotes pequeños para no sobrecargar
    const batchSize = 3;
    for (let i = 0; i < conversations.length; i += batchSize) {
      const batch = conversations.slice(i, i + batchSize);
      
      // Procesar lote en paralelo
      const batchPromises = batch.map(async (conversation) => {
        try {
          const unreadCount = await getUnreadCount(conversation.id);
          return { id: conversation.id, unreadCount };
        } catch (error) {
          console.error(`Error obteniendo unreadCount para ${conversation.id}:`, error);
          return { id: conversation.id, unreadCount: 0 };
        }
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Actualizar estado con los resultados del lote
      setConversations(prev => {
        const updatedConversations = prev.map(conv => {
          const result = batchResults.find(r => 
            r.status === 'fulfilled' && r.value.id === conv.id
          );
          if (result && result.status === 'fulfilled') {
            return { ...conv, unreadCount: result.value.unreadCount };
          }
          return conv;
        });
        
        // Reordenar después de cada lote: primero por mensajes no leídos, luego por fecha más reciente
        return updatedConversations.sort((a, b) => {
          // Primero por mensajes no leídos (descendente)
          if ((a.unreadCount || 0) !== (b.unreadCount || 0)) {
            return (b.unreadCount || 0) - (a.unreadCount || 0);
          }
          // Luego por fecha de actualización (descendente - más recientes primero)
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
      });
      
      // Pausa pequeña entre lotes para no sobrecargar
      if (i + batchSize < conversations.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log('✅ Contadores de mensajes no leídos cargados completamente');
  };

  const loadMessages = async (conversation: EnrichedConversation) => {
    if (!ws) return;
    try {
      console.log(`🔍 DIAGNÓSTICO: Cargando mensajes para conversación ${conversation.id}`);
      console.log(`👤 Usuario: ${conversation.user?.full_name}`);
      console.log(`📱 Plataforma: ${conversation.platform}`);
      console.log(`🔄 Es recuperada: ${conversation.isRecovered}`);
      
      let messagesToShow: Message[] = [];
      
      if (conversation.isRecovered) {
        // Para conversaciones recuperadas, usar mensajes del cache
        messagesToShow = conversationMessages[conversation.id] || [];
        console.log(`📨 Cargando ${messagesToShow.length} mensajes de conversación recuperada: ${conversation.user?.full_name}`);
      } else {
        // Para conversaciones normales, cargar desde el servidor
        console.log(`🌐 Solicitando mensajes al servidor para conversación ${conversation.id}...`);
        const messagesData = await ws.getMessages(conversation.id);
        messagesToShow = messagesData.messages || [];
        console.log(`📨 Respuesta del servidor: ${messagesToShow.length} mensajes`);
        
        // Mostrar detalles de los mensajes para diagnóstico
        if (messagesToShow.length > 0) {
          console.log(`📋 Últimos 3 mensajes:`, messagesToShow.slice(-3).map(msg => ({
            id: msg.id,
            content: msg.content.substring(0, 50) + '...',
            role: msg.role,
            created_at: msg.created_at
          })));
        } else {
          console.log(`⚠️ No se obtuvieron mensajes del servidor`);
        }
      }
      
      // FUNCIONALIDAD 1: Ordenar mensajes cronológicamente (más antiguos primero, más recientes al final)
      messagesToShow = messagesToShow.sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      
      console.log(`✅ Estableciendo ${messagesToShow.length} mensajes ordenados en el estado`);
      setMessages(messagesToShow);
      setSelectedConversation(conversation);
      
      // FUNCIONALIDAD 2: Marcar conversación como leída en la base de datos
      if ((conversation.unreadCount || 0) > 0 && !conversation.isRecovered) {
        try {
          console.log(`👁️ Marcando conversación ${conversation.id} como leída en la base de datos...`);
          await ws.markConversationAsRead(conversation.id);
          console.log(`✅ Conversación marcada como leída exitosamente`);
        } catch (error) {
          console.error('❌ Error marcando conversación como leída:', error);
        }
      }
      
      // Actualizar el contador de no leídos en la lista local
      if ((conversation.unreadCount || 0) > 0) {
        setConversations(prev => prev.map(conv => 
          conv.id === conversation.id 
            ? { ...conv, unreadCount: 0 }
            : conv
        ));
      }
      
    } catch (error) {
      console.error('❌ Error cargando mensajes:', error);
    }
  };

  const sendMessage = async () => {
    if (!ws || !selectedConversation || !newMessage.trim()) return;
    try {
      await ws.sendMessage(selectedConversation.id, newMessage.trim(), 'user');
      setNewMessage('');
      // Recargar mensajes
      loadMessages(selectedConversation);
    } catch (error) {
      console.error('Error enviando mensaje:', error);
    }
  };

  // Función para cargar mensajes de una conversación para búsqueda
  const loadConversationMessages = async (conversationId: string) => {
    if (!ws || conversationMessages[conversationId]) return conversationMessages[conversationId];
    
    try {
      const messagesData = await ws.getMessages(conversationId);
      const messages = messagesData.messages || [];
      setConversationMessages(prev => ({
        ...prev,
        [conversationId]: messages
      }));
      return messages;
    } catch (error) {
      console.error('Error cargando mensajes para búsqueda:', error);
      return [];
    }
  };

  // Lógica de filtrado con useMemo para optimización
  const filteredConversations = useMemo(() => {
    if (!filters.searchTerm && !filters.platform && !filters.status && !filters.dateFrom && !filters.dateTo) {
      return conversations;
    }

    return conversations.filter(conversation => {
      const user = conversation.user;
      const searchTerm = filters.searchTerm.toLowerCase();

      // Filtro por término de búsqueda (usuario, conversación)
      if (searchTerm) {
        const matchesUser = 
          user?.full_name?.toLowerCase().includes(searchTerm) ||
          user?.email?.toLowerCase().includes(searchTerm) ||
          user?.phone?.toLowerCase().includes(searchTerm) ||
          user?.company?.toLowerCase().includes(searchTerm);
        
        const matchesConversation = 
          conversation.id.toLowerCase().includes(searchTerm) ||
          conversation.external_id?.toLowerCase().includes(searchTerm);

        if (!matchesUser && !matchesConversation) {
          return false;
        }
      }

      // Filtro por plataforma
      if (filters.platform && conversation.platform !== filters.platform) {
        return false;
      }

      // Filtro por estado
      if (filters.status && conversation.status !== filters.status) {
        return false;
      }

      // Filtro por fecha
      if (filters.dateFrom || filters.dateTo) {
        const conversationDate = new Date(conversation.created_at);
        
        if (filters.dateFrom) {
          const fromDate = new Date(filters.dateFrom);
          if (conversationDate < fromDate) return false;
        }
        
        if (filters.dateTo) {
          const toDate = new Date(filters.dateTo);
          toDate.setHours(23, 59, 59, 999); // Incluir todo el día
          if (conversationDate > toDate) return false;
        }
      }

      return true;
    });
  }, [conversations, filters]);

  // Función para limpiar filtros
  const clearFilters = () => {
    setFilters({
      searchTerm: '',
      platform: '',
      status: '',
      dateFrom: '',
      dateTo: ''
    });
  };

  // Función para toggle del agente IA
  const toggleAgentStatus = async (conversationId: string, enabled: boolean) => {
    if (!ws) return;
    
    try {
      console.log(`🤖 ${enabled ? 'Activando' : 'Desactivando'} agente IA para conversación ${conversationId}`);
      await ws.toggleAgentStatus(conversationId, enabled);
      
      // Actualizar el estado local
      setConversations(prev => prev.map(conv => 
        conv.id === conversationId 
          ? { ...conv, agent_enabled: enabled }
          : conv
      ));
      
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(prev => prev ? { ...prev, agent_enabled: enabled } : null);
      }
      
      console.log(`✅ Agente IA ${enabled ? 'activado' : 'desactivado'} correctamente`);
    } catch (error) {
      console.error('❌ Error cambiando estado del agente IA:', error);
    }
  };

  // Función para archivar conversación
  const archiveConversation = async (conversationId: string) => {
    if (!ws) return;
    
    try {
      console.log(`📁 Archivando conversación ${conversationId}`);
      await ws.archiveConversation(conversationId);
      
      // Remover la conversación de la lista
      setConversations(prev => prev.filter(conv => conv.id !== conversationId));
      
      // Si era la conversación seleccionada, limpiar selección
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(null);
        setMessages([]);
      }
      
      console.log('✅ Conversación archivada correctamente');
    } catch (error) {
      console.error('❌ Error archivando conversación:', error);
    }
  };

  // Función para obtener detalles completos de una conversación
  const getConversationDetails = async (conversationId: string) => {
    if (!ws) return null;
    
    try {
      console.log(`🔍 Obteniendo detalles completos de conversación ${conversationId}`);
      const details = await ws.getConversationDetails(conversationId);
      console.log('📋 Detalles de conversación:', details);
      return details;
    } catch (error) {
      console.error('❌ Error obteniendo detalles de conversación:', error);
      return null;
    }
  };

  // Obtener opciones únicas para los filtros
  const platformOptions = useMemo(() => {
    const platforms = Array.from(new Set(conversations.map(c => c.platform).filter(Boolean)));
    return platforms;
  }, [conversations]);

  const statusOptions = useMemo(() => {
    const statuses = Array.from(new Set(conversations.map(c => c.status).filter(Boolean)));
    return statuses;
  }, [conversations]);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Banner de diagnóstico */}
        {showDiagnostic && loadingStats.usersWithoutConversations > 0 && (
          <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-yellow-800">
                  Datos Incompletos Detectados
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>
                    Se detectaron <strong>{loadingStats.usersWithoutConversations}</strong> usuarios de <strong>{loadingStats.usersTotal}</strong> que no tienen conversaciones asociadas.
                    Esto puede indicar problemas de carga o inconsistencias en los datos.
                  </p>
                  <div className="mt-2 text-xs">
                    <p>📊 Estadísticas de carga:</p>
                    <p>• Total usuarios: {loadingStats.usersTotal}</p>
                    <p>• Conversaciones cargadas: {loadingStats.conversationsTotal}</p>
                    <p>• Usuarios sin conversaciones: {loadingStats.usersWithoutConversations}</p>
                  </div>
                </div>
                <div className="mt-3 flex space-x-2">
                  <button
                    onClick={loadConversations}
                    className="text-sm bg-yellow-100 text-yellow-800 px-3 py-1 rounded-md hover:bg-yellow-200"
                  >
                    🔄 Reintentar Carga
                  </button>
                  <button
                    onClick={() => setShowDiagnostic(false)}
                    className="text-sm text-yellow-600 hover:text-yellow-800"
                  >
                    Ocultar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="flex h-[calc(100vh-8rem)] bg-white rounded-lg shadow overflow-hidden">
          {/* Lista de conversaciones */}
          <div className="w-1/3 border-r border-gray-200 flex flex-col">
            {/* Header con título y botón de filtros */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-900">Conversaciones</h2>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={loadConversations}
                    className="p-2 rounded-md text-gray-400 hover:text-gray-600 transition-colors"
                    title="Refrescar conversaciones"
                  >
                    <FiRefreshCw className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={clsx(
                      'p-2 rounded-md transition-colors',
                      showFilters ? 'bg-indigo-100 text-indigo-600' : 'text-gray-400 hover:text-gray-600'
                    )}
                  >
                    <FiFilter className="h-4 w-4" />
                  </button>
                </div>
              </div>
              
              {/* Barra de búsqueda */}
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <input
                  type="text"
                  placeholder="Buscar conversaciones..."
                  value={filters.searchTerm}
                  onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Panel de filtros expandible */}
            {showFilters && (
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-700">Filtros</h3>
                    <button
                      onClick={clearFilters}
                      className="text-xs text-indigo-600 hover:text-indigo-800"
                    >
                      Limpiar filtros
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Plataforma
                      </label>
                      <select
                        value={filters.platform}
                        onChange={(e) => setFilters(prev => ({ ...prev, platform: e.target.value }))}
                        className="w-full text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="">Todas</option>
                        {platformOptions.map(platform => (
                          <option key={platform} value={platform}>{platform}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Estado
                      </label>
                      <select
                        value={filters.status}
                        onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                        className="w-full text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="">Todos</option>
                        {statusOptions.map(status => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Desde
                      </label>
                      <input
                        type="date"
                        value={filters.dateFrom}
                        onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                        className="w-full text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Hasta
                      </label>
                      <input
                        type="date"
                        value={filters.dateTo}
                        onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                        className="w-full text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Lista de conversaciones */}
            <div className="flex-1 overflow-y-auto">
              {filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <FiMessageCircle className="h-12 w-12 mb-4" />
                  <p className="text-lg font-medium">No hay conversaciones</p>
                  <p className="text-sm">Las conversaciones aparecerán aquí cuando lleguen mensajes</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {filteredConversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      onClick={() => loadMessages(conversation)}
                      className={clsx(
                        'p-4 cursor-pointer hover:bg-gray-50 transition-colors',
                        selectedConversation?.id === conversation.id && 'bg-indigo-50 border-r-2 border-indigo-500'
                      )}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0">
                          <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                            <FiUser className="h-5 w-5 text-gray-600" />
                          </div>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {conversation.user?.full_name || 'Usuario desconocido'}
                            </p>
                            <div className="flex items-center space-x-2">
                              {(conversation.unreadCount || 0) > 0 && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                  {conversation.unreadCount}
                                </span>
                              )}
                              <span className="text-xs text-gray-500">
                                {formatSpecificTime(conversation.updated_at)}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-sm text-gray-600 truncate">
                              {conversation.user?.email || conversation.user?.phone || 'Sin contacto'}
                            </p>
                            <div className="flex items-center space-x-1">
                              {conversation.isRecovered && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                  Recuperada
                                </span>
                              )}
                              <span className={clsx(
                                'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium',
                                conversation.platform === 'whatsapp' && 'bg-green-100 text-green-800',
                                conversation.platform === 'telegram' && 'bg-blue-100 text-blue-800',
                                conversation.platform === 'instagram' && 'bg-pink-100 text-pink-800',
                                conversation.platform === 'facebook' && 'bg-blue-100 text-blue-800',
                                conversation.platform === 'recovered' && 'bg-yellow-100 text-yellow-800',
                                !['whatsapp', 'telegram', 'instagram', 'facebook', 'recovered'].includes(conversation.platform) && 'bg-gray-100 text-gray-800'
                              )}>
                                {conversation.platform}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between mt-2">
                            <span className={clsx(
                              'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                              conversation.status === 'active' && 'bg-green-100 text-green-800',
                              conversation.status === 'pending' && 'bg-yellow-100 text-yellow-800',
                              conversation.status === 'closed' && 'bg-gray-100 text-gray-800',
                              conversation.status === 'recovered' && 'bg-yellow-100 text-yellow-800'
                            )}>
                              {conversation.status}
                            </span>
                            
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleAgentStatus(conversation.id, !conversation.agent_enabled);
                                }}
                                className={clsx(
                                  'p-1 rounded transition-colors',
                                  conversation.agent_enabled 
                                    ? 'text-green-600 hover:text-green-800' 
                                    : 'text-gray-400 hover:text-gray-600'
                                )}
                                title={conversation.agent_enabled ? 'Desactivar agente IA' : 'Activar agente IA'}
                              >
                                <FiCpu className="h-4 w-4" />
                              </button>
                              
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  getConversationDetails(conversation.id);
                                }}
                                className="p-1 rounded text-gray-400 hover:text-gray-600 transition-colors"
                                title="Ver detalles"
                              >
                                <FiInfo className="h-4 w-4" />
                              </button>
                              
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  archiveConversation(conversation.id);
                                }}
                                className="p-1 rounded text-gray-400 hover:text-red-600 transition-colors"
                                title="Archivar conversación"
                              >
                                <FiArchive className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Panel de chat */}
          <div className="flex-1 flex flex-col">
            {selectedConversation ? (
              <>
                {/* Header del chat */}
                <div className="p-4 border-b border-gray-200 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                        <FiUser className="h-5 w-5 text-gray-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">
                          {selectedConversation.user?.full_name || 'Usuario desconocido'}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {selectedConversation.user?.email || selectedConversation.user?.phone || 'Sin contacto'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <span className={clsx(
                        'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                        selectedConversation.platform === 'whatsapp' && 'bg-green-100 text-green-800',
                        selectedConversation.platform === 'telegram' && 'bg-blue-100 text-blue-800',
                        selectedConversation.platform === 'instagram' && 'bg-pink-100 text-pink-800',
                        selectedConversation.platform === 'facebook' && 'bg-blue-100 text-blue-800',
                        selectedConversation.platform === 'recovered' && 'bg-yellow-100 text-yellow-800',
                        !['whatsapp', 'telegram', 'instagram', 'facebook', 'recovered'].includes(selectedConversation.platform) && 'bg-gray-100 text-gray-800'
                      )}>
                        {selectedConversation.platform}
                      </span>
                      
                      <button
                        onClick={() => toggleAgentStatus(selectedConversation.id, !selectedConversation.agent_enabled)}
                        className={clsx(
                          'p-2 rounded-md transition-colors',
                          selectedConversation.agent_enabled 
                            ? 'bg-green-100 text-green-600 hover:bg-green-200' 
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        )}
                        title={selectedConversation.agent_enabled ? 'Desactivar agente IA' : 'Activar agente IA'}
                      >
                        <FiCpu className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Mensajes */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      <div className="text-center">
                        <FiMessageCircle className="h-12 w-12 mx-auto mb-4" />
                        <p className="text-lg font-medium">No hay mensajes</p>
                        <p className="text-sm">Inicia la conversación enviando un mensaje</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={clsx(
                            'flex',
                            message.role === 'user' ? 'justify-end' : 'justify-start'
                          )}
                        >
                          <div
                            className={clsx(
                              'max-w-xs lg:max-w-md px-4 py-2 rounded-lg',
                              message.role === 'user'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-gray-200 text-gray-900'
                            )}
                          >
                            <p className="text-sm">{message.content}</p>
                            <p className={clsx(
                              'text-xs mt-1',
                              message.role === 'user' ? 'text-indigo-200' : 'text-gray-500'
                            )}>
                              {format(new Date(message.created_at), 'HH:mm', { locale: es })}
                            </p>
                          </div>
                        </div>
                      ))}
                      {/* Elemento para scroll automático */}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>

                {/* Input para nuevo mensaje */}
                <div className="p-4 border-t border-gray-200 bg-white">
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                      placeholder="Escribe un mensaje..."
                      className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!newMessage.trim()}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <FiSend className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <FiMessageCircle className="h-16 w-16 mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">Selecciona una conversación</h3>
                  <p className="text-sm">Elige una conversación de la lista para ver los mensajes</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default ChatsPage;
