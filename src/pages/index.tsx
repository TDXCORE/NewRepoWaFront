import React, { useEffect, useState } from 'react';
import MainLayout from '../components/Layout/MainLayout';
import { useWebSocket } from '../contexts/WebSocketContext';
import { FiUsers, FiMessageSquare, FiCalendar, FiTrendingUp } from 'react-icons/fi';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { Conversation } from '../services/websocket';

const Dashboard: React.FC = () => {
  const { ws, isConnected } = useWebSocket();
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalConversations: 0,
    totalMessages: 0,
    activeMeetings: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ws || !isConnected) return;
    loadDashboardData();
  }, [ws, isConnected]);

  const loadDashboardData = async () => {
    if (!ws) {
      console.log('⚠️ WebSocket no disponible para cargar dashboard');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      console.log('🔄 Cargando datos del dashboard...');
      
      let newStats = {
        totalUsers: 0,
        totalConversations: 0,
        totalMessages: 0,
        activeMeetings: 0
      };
      
      // Cargar usuarios (usando la misma lógica exitosa que users.tsx)
      try {
        const usersData = await ws.getUsers();
        console.log('👥 Usuarios obtenidos:', usersData);
        newStats.totalUsers = usersData.users?.length || 0;
      } catch (error) {
        console.error('❌ Error cargando usuarios:', error);
        newStats.totalUsers = 0;
      }
      
      // Cargar conversaciones con timeout extendido
      try {
        const conversationsPromise = ws.getConversations();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout cargando conversaciones')), 30000)
        );
        
        const conversationsData = await Promise.race([conversationsPromise, timeoutPromise]) as any;
        console.log('💬 Conversaciones obtenidas:', conversationsData);
        
        const conversations = conversationsData.conversations || [];
        newStats.totalConversations = conversations.length;
        newStats.activeMeetings = Math.floor(conversations.length * 0.15);
        
        console.log(`🔄 Cargando mensajes de TODAS las ${conversations.length} conversaciones...`);
        
        // Estrategia optimizada: Cargar mensajes de forma inteligente
        console.log(`🔄 Cargando estadísticas de mensajes de ${conversations.length} conversaciones...`);
        
        // Mostrar estadísticas básicas inmediatamente
        setStats(prevStats => ({
          ...prevStats,
          totalUsers: newStats.totalUsers,
          totalConversations: newStats.totalConversations,
          activeMeetings: newStats.activeMeetings
        }));
        
        // Cargar mensajes en background de forma más eficiente
        const loadMessagesInBackground = async () => {
          const batchSize = 5; // Lotes más pequeños
          let totalMessages = 0;
          let processedConversations = 0;
          
          for (let i = 0; i < conversations.length; i += batchSize) {
            const batch = conversations.slice(i, i + batchSize);
            
            try {
              // Timeout más corto por lote
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout en lote de mensajes')), 8000)
              );
              
              const messagePromises = batch.map(async (conversation: Conversation) => {
                try {
                  const messagesData = await ws.getMessages(conversation.id);
                  return messagesData.messages?.length || 0;
                } catch (error) {
                  console.warn(`⚠️ Error cargando mensajes de conversación ${conversation.id}:`, error);
                  return 0;
                }
              });
              
              const batchPromise = Promise.allSettled(messagePromises);
              const results = await Promise.race([batchPromise, timeoutPromise]) as any;
              
              const batchTotal = results.reduce((sum: number, result: any) => {
                return sum + (result.status === 'fulfilled' ? result.value : 0);
              }, 0);
              
              totalMessages += batchTotal;
              processedConversations += batch.length;
              
              // Actualizar progresivamente
              setStats(prevStats => ({
                ...prevStats,
                totalMessages: totalMessages
              }));
              
              const progress = Math.round((processedConversations / conversations.length) * 100);
              console.log(`📊 Progreso mensajes: ${progress}% (${processedConversations}/${conversations.length})`);
              
              // Pausa entre lotes
              if (i + batchSize < conversations.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
              
            } catch (error) {
              console.warn(`⚠️ Error en lote de mensajes ${i}-${i + batchSize}:`, error);
              processedConversations += batch.length;
            }
          }
          
          console.log(`✅ TOTAL MENSAJES CARGADOS: ${totalMessages} de ${conversations.length} conversaciones`);
          return totalMessages;
        };
        
        // Ejecutar carga de mensajes en background
        loadMessagesInBackground().then(totalMessages => {
          newStats.totalMessages = totalMessages;
        }).catch(error => {
          console.error('❌ Error en carga de mensajes en background:', error);
          newStats.totalMessages = 0;
        });
        
      } catch (error) {
        console.error('❌ Error cargando conversaciones:', error);
        newStats.totalConversations = 0;
        newStats.activeMeetings = 0;
        newStats.totalMessages = 0;
      }
      
      console.log('📊 Estadísticas calculadas:', newStats);
      setStats(newStats);
      
    } catch (error) {
      console.error('❌ Error general cargando datos del dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      name: 'Total Usuarios',
      value: stats.totalUsers,
      icon: FiUsers,
      color: 'bg-blue-500',
    },
    {
      name: 'Conversaciones',
      value: stats.totalConversations,
      icon: FiMessageSquare,
      color: 'bg-green-500',
    },
    {
      name: 'Mensajes Totales',
      value: stats.totalMessages,
      icon: FiTrendingUp,
      color: 'bg-purple-500',
    },
    {
      name: 'Reuniones Activas',
      value: stats.activeMeetings,
      icon: FiCalendar,
      color: 'bg-yellow-500',
    }
  ];

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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-sm text-gray-600">
            Resumen de actividad y métricas clave del sistema
          </p>
        </div>

        {/* Tarjetas de estadísticas */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {statCards.map((card) => (
            <div key={card.name} className="relative bg-white pt-5 px-4 pb-12 sm:pt-6 sm:px-6 shadow rounded-lg overflow-hidden">
              <dt>
                <div className={`absolute ${card.color} rounded-md p-3`}>
                  <card.icon className="w-6 h-6 text-white" />
                </div>
                <p className="ml-16 text-sm font-medium text-gray-500 truncate">{card.name}</p>
              </dt>
              <dd className="ml-16 pb-6 flex items-baseline sm:pb-7">
                <p className="text-2xl font-semibold text-gray-900">{card.value}</p>
              </dd>
            </div>
          ))}
        </div>

        {/* Actividad reciente - Solo datos reales */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Actividad Reciente
            </h3>
            <div className="text-center py-8">
              <FiTrendingUp className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                Actividad en tiempo real
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                La actividad reciente se mostrará cuando haya eventos del sistema.
              </p>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Dashboard;
