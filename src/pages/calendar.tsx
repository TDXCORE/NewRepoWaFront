import React, { useState, useEffect } from 'react';
import MainLayout from '../components/Layout/MainLayout';
import { useWebSocket } from '../contexts/WebSocketContext';
import { FiCalendar, FiClock } from 'react-icons/fi';
import type { Conversation, User } from '../services/websocket';

interface Meeting {
  id: string;
  title: string;
  date: Date;
  time: string;
  duration: string;
  conversation?: Conversation;
  user?: User;
}

const CalendarPage: React.FC = () => {
  const { ws, isConnected } = useWebSocket();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalMeetings: 0,
    todayMeetings: 0,
    weekMeetings: 0
  });

  useEffect(() => {
    if (!ws || !isConnected) return;
    loadMeetingsData();
  }, [ws, isConnected]);

  const loadMeetingsData = async () => {
    if (!ws) {
      console.log('⚠️ WebSocket no disponible para cargar reuniones');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      console.log('🔄 Cargando datos de reuniones...');
      
      // Cargar conversaciones y usuarios en paralelo para mejor rendimiento
      const [conversationsData, usersData] = await Promise.all([
        ws.getConversations(),
        ws.getUsers()
      ]);
      
      console.log(`💬 TODAS las conversaciones para reuniones: ${conversationsData.conversations?.length || 0}`);
      console.log(`👥 TODOS los usuarios para reuniones: ${usersData.users?.length || 0}`);

      // Convertir conversaciones activas en reuniones potenciales
      const conversations = conversationsData.conversations || [];
      const users = usersData.users || [];
      
      const generatedMeetings: Meeting[] = conversations
        .filter(conv => conv.status === 'active' || conv.agent_enabled)
        .map((conversation, index) => {
          const user = users.find(u => u.id === conversation.user_id);
          const meetingDate = new Date(conversation.created_at);
          meetingDate.setHours(14 + (index % 8), 0, 0, 0); // Distribuir en horario laboral
          
          return {
            id: conversation.id,
            title: `Reunión con ${user?.full_name || 'Cliente'}`,
            date: meetingDate,
            time: `${14 + (index % 8)}:00`,
            duration: '1 hora',
            conversation,
            user
          };
        });

      setMeetings(generatedMeetings);
      
      // Calcular estadísticas
      const today = new Date();
      const todayMeetings = generatedMeetings.filter(meeting => 
        meeting.date.toDateString() === today.toDateString()
      ).length;
      
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      const weekMeetings = generatedMeetings.filter(meeting => 
        meeting.date >= weekStart && meeting.date <= weekEnd
      ).length;

      setStats({
        totalMeetings: generatedMeetings.length,
        todayMeetings,
        weekMeetings
      });

      console.log('📅 Reuniones cargadas:', generatedMeetings.length);
      
    } catch (error) {
      console.error('❌ Error cargando datos de reuniones:', error);
      setMeetings([]);
      setStats({
        totalMeetings: 0,
        todayMeetings: 0,
        weekMeetings: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const todayMeetings = meetings.filter(meeting => 
    meeting.date.toDateString() === selectedDate.toDateString()
  );

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
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Calendario de Reuniones</h1>
          <p className="mt-1 text-sm text-gray-600">
            Gestiona las reuniones programadas con tus leads ({stats.totalMeetings} reuniones activas)
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendario Simplificado */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Calendario de Reuniones
                </h3>
                <p className="text-gray-500">
                  {stats.totalMeetings > 0 
                    ? `${stats.totalMeetings} reuniones programadas basadas en conversaciones activas`
                    : 'No hay reuniones programadas'
                  }
                </p>
              </div>
            </div>

            {/* Estadísticas */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <FiCalendar className="h-6 w-6 text-blue-400" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Total Reuniones
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {stats.totalMeetings}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <FiClock className="h-6 w-6 text-green-400" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Hoy
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {stats.todayMeetings}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <FiCalendar className="h-6 w-6 text-purple-400" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Esta Semana
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {stats.weekMeetings}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Panel lateral */}
          <div className="space-y-6">
            {/* Reuniones del día */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">
                  Reuniones de Hoy
                </h3>
                <p className="text-sm text-gray-500">
                  {todayMeetings.length} reuniones programadas
                </p>
              </div>
              <div className="divide-y divide-gray-200">
                {todayMeetings.length > 0 ? (
                  todayMeetings.map((meeting) => (
                    <div key={meeting.id} className="px-6 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {meeting.title}
                          </p>
                          <p className="text-xs text-gray-400">
                            {meeting.time} - {meeting.duration}
                          </p>
                          {meeting.user?.phone && (
                            <p className="text-xs text-gray-500">
                              📞 {meeting.user.phone}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-6 py-8 text-center">
                    <FiCalendar className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">
                      No hay reuniones hoy
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Las reuniones se generan automáticamente desde conversaciones activas.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default CalendarPage;
