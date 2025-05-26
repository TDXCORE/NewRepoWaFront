import React, { useState, useEffect } from 'react';
import MainLayout from '../components/Layout/MainLayout';
import { useWebSocket } from '../contexts/WebSocketContext';
import { FiCalendar, FiClock, FiPlus, FiRefreshCw, FiUser, FiVideo, FiMessageCircle } from 'react-icons/fi';
import { format, startOfMonth, endOfMonth, addDays, isSameDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRouter } from 'next/router';

interface Meeting {
  id: string;
  subject: string;
  start_time: string;
  end_time: string;
  status: string;
  online_meeting_url?: string;
  users?: {
    full_name: string;
    email: string;
    phone: string;
  };
  lead_qualification?: {
    current_step: string;
  };
}

const CalendarPage: React.FC = () => {
  const { ws, isConnected } = useWebSocket();
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [calendarView, setCalendarView] = useState<{ [key: string]: Meeting[] }>({});
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [stats, setStats] = useState({
    totalMeetings: 0,
    todayMeetings: 0,
    weekMeetings: 0,
    scheduledMeetings: 0,
    completedMeetings: 0
  });

  useEffect(() => {
    if (!ws || !isConnected) return;
    loadMeetingsData();
  }, [ws, isConnected, selectedFilter, selectedStatus]);

  const loadMeetingsData = async () => {
    if (!ws) {
      console.log('⚠️ WebSocket no disponible para cargar reuniones');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      console.log('🔄 Cargando datos reales de reuniones...');
      
      // Cargar reuniones y vista de calendario en paralelo
      const [meetingsData, calendarData] = await Promise.allSettled([
        ws.getAllMeetings(selectedFilter, selectedStatus, 1000, 0),
        ws.getCalendarView(
          format(startOfMonth(selectedDate), 'yyyy-MM-dd'),
          format(endOfMonth(selectedDate), 'yyyy-MM-dd')
        )
      ]);

      // Procesar reuniones
      if (meetingsData.status === 'fulfilled') {
        console.log('📅 Reuniones obtenidas:', meetingsData.value);
        const meetingsArray = meetingsData.value.meetings || [];
        setMeetings(meetingsArray);
        
        // Calcular estadísticas
        const today = new Date();
        const todayMeetings = meetingsArray.filter((meeting: Meeting) => 
          isSameDay(parseISO(meeting.start_time), today)
        ).length;
        
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        const weekEnd = addDays(weekStart, 6);
        
        const weekMeetings = meetingsArray.filter((meeting: Meeting) => {
          const meetingDate = parseISO(meeting.start_time);
          return meetingDate >= weekStart && meetingDate <= weekEnd;
        }).length;

        const scheduledMeetings = meetingsArray.filter((meeting: Meeting) => 
          meeting.status === 'scheduled'
        ).length;

        const completedMeetings = meetingsArray.filter((meeting: Meeting) => 
          meeting.status === 'completed'
        ).length;

        setStats({
          totalMeetings: meetingsArray.length,
          todayMeetings,
          weekMeetings,
          scheduledMeetings,
          completedMeetings
        });
      } else {
        console.error('❌ Error cargando reuniones:', meetingsData.reason);
        setMeetings([]);
      }

      // Procesar vista de calendario
      if (calendarData.status === 'fulfilled') {
        console.log('📊 Vista de calendario obtenida:', calendarData.value);
        setCalendarView(calendarData.value.calendar || {});
      } else {
        console.error('❌ Error cargando vista de calendario:', calendarData.reason);
        setCalendarView({});
      }
      
    } catch (error) {
      console.error('❌ Error general cargando datos de reuniones:', error);
      setMeetings([]);
      setCalendarView({});
    } finally {
      setLoading(false);
    }
  };

  const syncCalendar = async () => {
    if (!ws) return;
    
    try {
      console.log('🔄 Sincronizando calendario con Outlook...');
      const syncResult = await ws.syncOutlookCalendar('bidirectional', 30);
      console.log('✅ Sincronización completada:', syncResult);
      
      // Recargar datos después de la sincronización
      await loadMeetingsData();
    } catch (error) {
      console.error('❌ Error sincronizando calendario:', error);
    }
  };

  const getMeetingsForDate = (date: Date): Meeting[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return calendarView[dateStr] || [];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'scheduled': return 'Programada';
      case 'completed': return 'Completada';
      case 'cancelled': return 'Cancelada';
      default: return status;
    }
  };

  const handleViewConversation = (userId: string) => {
    router.push(`/chats?user=${userId}`);
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

  const todayMeetings = getMeetingsForDate(selectedDate);

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Calendario de Reuniones</h1>
            <p className="mt-1 text-sm text-gray-600">
              Gestiona las reuniones programadas ({stats.totalMeetings} reuniones totales)
            </p>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Filtros */}
            <select
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">Todas</option>
              <option value="today">Hoy</option>
              <option value="this_week">Esta semana</option>
            </select>
            
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Todos los estados</option>
              <option value="scheduled">Programadas</option>
              <option value="completed">Completadas</option>
              <option value="cancelled">Canceladas</option>
            </select>
            
            <button
              onClick={syncCalendar}
              className="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <FiRefreshCw className="h-4 w-4 mr-1" />
              Sincronizar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Vista principal del calendario */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-medium text-gray-900">
                  {format(selectedDate, 'MMMM yyyy', { locale: es })}
                </h3>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setSelectedDate(addDays(selectedDate, -30))}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    ←
                  </button>
                  <button
                    onClick={() => setSelectedDate(new Date())}
                    className="px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200"
                  >
                    Hoy
                  </button>
                  <button
                    onClick={() => setSelectedDate(addDays(selectedDate, 30))}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    →
                  </button>
                </div>
              </div>
              
              {/* Calendario simplificado */}
              <div className="text-center">
                <p className="text-gray-500 mb-4">
                  {stats.totalMeetings > 0 
                    ? `${stats.totalMeetings} reuniones programadas`
                    : 'No hay reuniones programadas'
                  }
                </p>
                <div className="text-sm text-gray-600">
                  Fecha seleccionada: {format(selectedDate, 'dd/MM/yyyy', { locale: es })}
                </div>
              </div>
            </div>

            {/* Estadísticas */}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-4">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <FiCalendar className="h-5 w-5 text-blue-400" />
                    </div>
                    <div className="ml-3 w-0 flex-1">
                      <dl>
                        <dt className="text-xs font-medium text-gray-500 truncate">
                          Total
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
                <div className="p-4">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <FiClock className="h-5 w-5 text-green-400" />
                    </div>
                    <div className="ml-3 w-0 flex-1">
                      <dl>
                        <dt className="text-xs font-medium text-gray-500 truncate">
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
                <div className="p-4">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <FiCalendar className="h-5 w-5 text-purple-400" />
                    </div>
                    <div className="ml-3 w-0 flex-1">
                      <dl>
                        <dt className="text-xs font-medium text-gray-500 truncate">
                          Semana
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {stats.weekMeetings}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-4">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <FiClock className="h-5 w-5 text-blue-400" />
                    </div>
                    <div className="ml-3 w-0 flex-1">
                      <dl>
                        <dt className="text-xs font-medium text-gray-500 truncate">
                          Programadas
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {stats.scheduledMeetings}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-4">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <FiCalendar className="h-5 w-5 text-green-400" />
                    </div>
                    <div className="ml-3 w-0 flex-1">
                      <dl>
                        <dt className="text-xs font-medium text-gray-500 truncate">
                          Completadas
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {stats.completedMeetings}
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
            {/* Reuniones del día seleccionado */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">
                  Reuniones - {format(selectedDate, 'dd/MM/yyyy', { locale: es })}
                </h3>
                <p className="text-sm text-gray-500">
                  {todayMeetings.length} reuniones programadas
                </p>
              </div>
              <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                {todayMeetings.length > 0 ? (
                  todayMeetings.map((meeting) => (
                    <div key={meeting.id} className="px-6 py-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {meeting.subject}
                          </p>
                          <div className="mt-1 flex items-center space-x-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(meeting.status)}`}>
                              {getStatusLabel(meeting.status)}
                            </span>
                            {meeting.online_meeting_url && (
                              <FiVideo className="h-3 w-3 text-blue-500" title="Reunión online" />
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            <FiClock className="inline h-3 w-3 mr-1" />
                            {format(parseISO(meeting.start_time), 'HH:mm')} - {format(parseISO(meeting.end_time), 'HH:mm')}
                          </p>
                          {meeting.users && (
                            <p className="text-xs text-gray-500 mt-1">
                              <FiUser className="inline h-3 w-3 mr-1" />
                              {meeting.users.full_name}
                            </p>
                          )}
                          {meeting.lead_qualification && (
                            <p className="text-xs text-gray-400 mt-1">
                              Etapa: {meeting.lead_qualification.current_step}
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
                      No hay reuniones este día
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Selecciona otra fecha para ver las reuniones programadas.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Lista de todas las reuniones recientes */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">
                  Reuniones Recientes
                </h3>
                <p className="text-sm text-gray-500">
                  {meetings.length} reuniones ordenadas por fecha
                </p>
              </div>
              <div className="divide-y divide-gray-200 max-h-64 overflow-y-auto">
                {meetings
                  .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                  .map((meeting) => (
                  <div key={meeting.id} className="px-6 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {meeting.subject}
                        </p>
                        <p className="text-xs text-gray-500">
                          {format(parseISO(meeting.start_time), 'dd/MM/yyyy HH:mm', { locale: es })}
                        </p>
                        {meeting.users && (
                          <div className="flex items-center mt-1 space-x-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                              <FiUser className="h-3 w-3 mr-1" />
                              {meeting.users.full_name || meeting.users.email || meeting.users.phone}
                            </span>
                            <button
                              onClick={() => handleViewConversation(meeting.users?.email || '')}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200"
                            >
                              <FiMessageCircle className="h-3 w-3 mr-1" />
                              Ver conversación
                            </button>
                          </div>
                        )}
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(meeting.status)}`}>
                        {getStatusLabel(meeting.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default CalendarPage;
