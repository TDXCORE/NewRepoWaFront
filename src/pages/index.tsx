import React, { useEffect, useState } from 'react';
import MainLayout from '../components/Layout/MainLayout';
import { useWebSocket } from '../contexts/WebSocketContext';
import { FiUsers, FiMessageSquare, FiCalendar, FiTrendingUp, FiActivity } from 'react-icons/fi';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

const Dashboard: React.FC = () => {
  const { ws, isConnected } = useWebSocket();
  const [basicStats, setBasicStats] = useState({
    totalUsers: 0,
    activeConversations: 0,
    totalMeetings: 0,
    unreadMessages: 0
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    if (!ws || !isConnected) return;
    loadRealDashboardData();
    
    // Actualizar datos cada 30 segundos
    const interval = setInterval(() => {
      if (ws && isConnected) {
        loadRealDashboardData();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [ws, isConnected]);

  const loadRealDashboardData = async () => {
    if (!ws) {
      console.log('⚠️ WebSocket no disponible para cargar dashboard');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      console.log('🔄 Cargando datos reales básicos del dashboard...');
      
      // Cargar datos básicos en paralelo usando las funciones que sabemos que existen
      const [usersData, conversationsData, meetingsData] = await Promise.allSettled([
        ws.getUsers(),
        ws.getConversations(),
        ws.getAllMeetings('all', '', 100, 0)
      ]);

      let totalUsers = 0;
      let activeConversations = 0;
      let totalMeetings = 0;
      let unreadMessages = 0;
      const activity: any[] = [];

      // Procesar usuarios
      if (usersData.status === 'fulfilled') {
        const users = usersData.value.users || [];
        totalUsers = users.length;
        console.log(`👥 Total usuarios: ${totalUsers}`);
        
        // Agregar usuarios recientes a la actividad
        users.slice(0, 5).forEach(user => {
          activity.push({
            type: 'new_user',
            timestamp: user.created_at,
            data: {
              full_name: user.full_name,
              user: user.full_name
            }
          });
        });
      } else {
        console.error('❌ Error cargando usuarios:', usersData.reason);
      }

      // Procesar conversaciones
      if (conversationsData.status === 'fulfilled') {
        const conversations = conversationsData.value.conversations || [];
        activeConversations = conversations.filter(conv => conv.status === 'active').length;
        console.log(`💬 Conversaciones activas: ${activeConversations}`);
        
        // Contar mensajes no leídos y agregar actividad
        for (const conv of conversations.slice(0, 10)) {
          try {
            const messagesData = await ws.getMessages(conv.id);
            const messages = messagesData.messages || [];
            const unread = messages.filter(msg => !msg.read).length;
            unreadMessages += unread;
            
            // Agregar mensajes recientes a la actividad
            if (messages.length > 0) {
              const lastMessage = messages[messages.length - 1];
              activity.push({
                type: 'new_message',
                timestamp: lastMessage.created_at,
                data: {
                  user: conv.external_id || 'Usuario',
                  content: lastMessage.content
                }
              });
            }
          } catch (error) {
            console.warn(`⚠️ Error obteniendo mensajes para conversación ${conv.id}:`, error);
          }
        }
        console.log(`📨 Mensajes no leídos: ${unreadMessages}`);
      } else {
        console.error('❌ Error cargando conversaciones:', conversationsData.reason);
      }

      // Procesar reuniones
      if (meetingsData.status === 'fulfilled') {
        const meetings = meetingsData.value.meetings || [];
        totalMeetings = meetings.length;
        console.log(`📅 Total reuniones: ${totalMeetings}`);
        
        // Agregar reuniones recientes a la actividad
        meetings.slice(0, 5).forEach((meeting: any) => {
          activity.push({
            type: 'new_meeting',
            timestamp: meeting.created_at,
            data: {
              full_name: meeting.users?.full_name || 'Usuario',
              subject: meeting.subject
            }
          });
        });
      } else {
        console.error('❌ Error cargando reuniones:', meetingsData.reason);
      }

      // Actualizar estadísticas
      setBasicStats({
        totalUsers,
        activeConversations,
        totalMeetings,
        unreadMessages
      });

      // Ordenar actividad por fecha (más reciente primero) y tomar las primeras 10
      const sortedActivity = activity
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10);
      
      setRecentActivity(sortedActivity);
      setLastUpdate(new Date());
      
      console.log('✅ Dashboard cargado con datos reales:', {
        totalUsers,
        activeConversations,
        totalMeetings,
        unreadMessages,
        activityItems: sortedActivity.length
      });
      
    } catch (error) {
      console.error('❌ Error general cargando datos del dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityTypeIcon = (type: string) => {
    switch (type) {
      case 'new_user': return '👤';
      case 'new_message': return '💬';
      case 'new_meeting': return '📅';
      default: return '📋';
    }
  };

  const getActivityTypeLabel = (type: string) => {
    switch (type) {
      case 'new_user': return 'Nuevo usuario';
      case 'new_message': return 'Nuevo mensaje';
      case 'new_meeting': return 'Nueva reunión';
      default: return 'Actividad';
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </MainLayout>
    );
  }

  const statCards = [
    {
      name: 'Total Usuarios',
      value: basicStats.totalUsers,
      icon: FiUsers,
      color: 'bg-blue-500',
      change: basicStats.totalUsers > 0 ? `${basicStats.totalUsers} registrados` : null
    },
    {
      name: 'Conversaciones Activas',
      value: basicStats.activeConversations,
      icon: FiMessageSquare,
      color: 'bg-green-500',
      change: basicStats.unreadMessages > 0 ? `${basicStats.unreadMessages} no leídos` : null
    },
    {
      name: 'Mensajes Totales',
      value: basicStats.unreadMessages,
      icon: FiTrendingUp,
      color: 'bg-purple-500',
      change: 'En tiempo real'
    },
    {
      name: 'Reuniones Totales',
      value: basicStats.totalMeetings,
      icon: FiCalendar,
      color: 'bg-yellow-500',
      change: basicStats.totalMeetings > 0 ? `${basicStats.totalMeetings} programadas` : null
    }
  ];

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-2 text-sm text-gray-600">
              Resumen de actividad y métricas clave del sistema
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700">Período:</span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Tiempo Real
            </span>
          </div>
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
                {card.change && (
                  <p className="ml-2 flex items-baseline text-sm font-semibold text-green-600">
                    {card.change}
                  </p>
                )}
              </dd>
            </div>
          ))}
        </div>

        {/* Actividad Reciente */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Actividad Reciente
            </h3>
            {recentActivity.length > 0 ? (
              <div className="flow-root">
                <ul className="-mb-8">
                  {recentActivity.map((activity, activityIdx) => (
                    <li key={`${activity.type}-${activity.timestamp}-${activityIdx}`}>
                      <div className="relative pb-8">
                        {activityIdx !== recentActivity.length - 1 ? (
                          <span
                            className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                            aria-hidden="true"
                          />
                        ) : null}
                        <div className="relative flex space-x-3">
                          <div>
                            <span className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-sm">
                              {getActivityTypeIcon(activity.type)}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                            <div>
                              <p className="text-sm text-gray-900">
                                <span className="font-medium">{getActivityTypeLabel(activity.type)}</span>
                                {activity.data?.user && (
                                  <span className="text-gray-600"> - {activity.data.user}</span>
                                )}
                                {activity.data?.full_name && (
                                  <span className="text-gray-600"> - {activity.data.full_name}</span>
                                )}
                              </p>
                              {activity.data?.content && (
                                <p className="text-xs text-gray-500 mt-1 truncate max-w-md">
                                  {activity.data.content}
                                </p>
                              )}
                              {activity.data?.subject && (
                                <p className="text-xs text-gray-500 mt-1">
                                  {activity.data.subject}
                                </p>
                              )}
                            </div>
                            <div className="text-right text-sm whitespace-nowrap text-gray-500">
                              {formatDistanceToNow(new Date(activity.timestamp), { 
                                addSuffix: true, 
                                locale: es 
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-center py-8">
                <FiActivity className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  Actividad en tiempo real
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  La actividad reciente se mostrará cuando haya eventos del sistema.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Información de actualización */}
        <div className="mt-4 text-center text-xs text-gray-500">
          Última actualización: {format(lastUpdate, 'HH:mm:ss')} • 
          Estado: {isConnected ? '🟢 Conectado' : '🔴 Desconectado'}
        </div>
      </div>
    </MainLayout>
  );
};

export default Dashboard;
