import React, { useEffect, useState, useMemo } from 'react';
import MainLayout from '../components/Layout/MainLayout';
import { useWebSocket } from '../contexts/WebSocketContext';
import { FiUser, FiMail, FiPhone, FiHome, FiSearch, FiFilter, FiX, FiMessageCircle, FiCalendar, FiEdit, FiTrash2 } from 'react-icons/fi';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import clsx from 'clsx';
import type { User } from '../services/websocket';

interface EnrichedUser extends User {
  conversationCount?: number;
  lastMessageDate?: string;
  meetingCount?: number;
  lastActivity?: string;
}

interface FilterState {
  searchTerm: string;
  company: string;
  hasConversations: string;
  hasMeetings: string;
  dateFrom: string;
  dateTo: string;
}

const UsersPage: React.FC = () => {
  const { ws, isConnected } = useWebSocket();
  const [users, setUsers] = useState<EnrichedUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<EnrichedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 0,
    usersWithConversations: 0,
    usersWithMeetings: 0,
    usersWithoutActivity: 0
  });
  
  // Estados de filtros
  const [filters, setFilters] = useState<FilterState>({
    searchTerm: '',
    company: '',
    hasConversations: '',
    hasMeetings: '',
    dateFrom: '',
    dateTo: ''
  });

  useEffect(() => {
    if (!ws || !isConnected) return;
    loadUsers();
  }, [ws, isConnected]);

  const loadUsers = async () => {
    if (!ws) {
      console.log('⚠️ WebSocket no disponible para cargar usuarios');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      console.log('🔄 Cargando datos reales de usuarios...');
      
      // Cargar usuarios y datos relacionados en paralelo
      const [usersData, conversationsData, meetingsData] = await Promise.allSettled([
        ws.getUsers(),
        ws.getConversations(),
        ws.getAllMeetings('all', '', 1000, 0)
      ]);

      // Procesar usuarios
      let enrichedUsers: EnrichedUser[] = [];
      if (usersData.status === 'fulfilled') {
        console.log('👥 Usuarios obtenidos:', usersData.value);
        enrichedUsers = (usersData.value.users || []).map(user => ({
          ...user,
          conversationCount: 0,
          meetingCount: 0,
          lastActivity: user.updated_at || user.created_at
        }));
      } else {
        console.error('❌ Error cargando usuarios:', usersData.reason);
        setUsers([]);
        setLoading(false);
        return;
      }

      // Enriquecer con datos de conversaciones
      if (conversationsData.status === 'fulfilled') {
        console.log('💬 Conversaciones obtenidas para enriquecimiento:', conversationsData.value);
        const conversations = conversationsData.value.conversations || [];
        
        // Contar conversaciones por usuario
        const conversationCounts = new Map<string, number>();
        const lastMessageDates = new Map<string, string>();
        
        conversations.forEach((conv: any) => {
          const userId = conv.user_id;
          conversationCounts.set(userId, (conversationCounts.get(userId) || 0) + 1);
          
          // Actualizar fecha de último mensaje si es más reciente
          const currentDate = lastMessageDates.get(userId);
          if (!currentDate || new Date(conv.updated_at) > new Date(currentDate)) {
            lastMessageDates.set(userId, conv.updated_at);
          }
        });
        
        // Aplicar datos de conversaciones a usuarios
        enrichedUsers = enrichedUsers.map(user => ({
          ...user,
          conversationCount: conversationCounts.get(user.id) || 0,
          lastMessageDate: lastMessageDates.get(user.id)
        }));
      } else {
        console.error('❌ Error cargando conversaciones para enriquecimiento:', conversationsData.reason);
      }

      // Enriquecer con datos de reuniones
      if (meetingsData.status === 'fulfilled') {
        console.log('📅 Reuniones obtenidas para enriquecimiento:', meetingsData.value);
        const meetings = meetingsData.value.meetings || [];
        
        // Contar reuniones por usuario
        const meetingCounts = new Map<string, number>();
        
        meetings.forEach((meeting: any) => {
          if (meeting.users?.id) {
            const userId = meeting.users.id;
            meetingCounts.set(userId, (meetingCounts.get(userId) || 0) + 1);
          }
        });
        
        // Aplicar datos de reuniones a usuarios
        enrichedUsers = enrichedUsers.map(user => ({
          ...user,
          meetingCount: meetingCounts.get(user.id) || 0
        }));
      } else {
        console.error('❌ Error cargando reuniones para enriquecimiento:', meetingsData.reason);
      }

      // Ordenar usuarios por actividad más reciente
      enrichedUsers.sort((a, b) => {
        const dateA = new Date(a.lastMessageDate || a.lastActivity || a.created_at);
        const dateB = new Date(b.lastMessageDate || b.lastActivity || b.created_at);
        return dateB.getTime() - dateA.getTime();
      });

      console.log(`✅ Usuarios enriquecidos cargados: ${enrichedUsers.length}`);
      setUsers(enrichedUsers);
      
      // Calcular estadísticas
      const usersWithConversations = enrichedUsers.filter(u => (u.conversationCount || 0) > 0).length;
      const usersWithMeetings = enrichedUsers.filter(u => (u.meetingCount || 0) > 0).length;
      const usersWithoutActivity = enrichedUsers.filter(u => 
        (u.conversationCount || 0) === 0 && (u.meetingCount || 0) === 0
      ).length;

      setStats({
        totalUsers: enrichedUsers.length,
        usersWithConversations,
        usersWithMeetings,
        usersWithoutActivity
      });
      
    } catch (error) {
      console.error('❌ Error general cargando usuarios:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  // Función para eliminar usuario
  const deleteUser = async (userId: string) => {
    if (!ws) return;
    
    try {
      console.log(`🗑️ Eliminando usuario ${userId}`);
      await ws.deleteUser(userId);
      
      // Remover usuario de la lista
      setUsers(prev => prev.filter(user => user.id !== userId));
      
      // Si era el usuario seleccionado, limpiar selección
      if (selectedUser?.id === userId) {
        setSelectedUser(null);
      }
      
      console.log('✅ Usuario eliminado correctamente');
    } catch (error) {
      console.error('❌ Error eliminando usuario:', error);
    }
  };

  // Lógica de filtrado con useMemo para optimización
  const filteredUsers = useMemo(() => {
    if (!filters.searchTerm && !filters.company && !filters.hasConversations && !filters.hasMeetings && !filters.dateFrom && !filters.dateTo) {
      return users;
    }

    return users.filter(user => {
      const searchTerm = filters.searchTerm.toLowerCase();

      // Filtro por término de búsqueda
      if (searchTerm) {
        const matchesUser = 
          user.full_name?.toLowerCase().includes(searchTerm) ||
          user.email?.toLowerCase().includes(searchTerm) ||
          user.phone?.toLowerCase().includes(searchTerm) ||
          user.company?.toLowerCase().includes(searchTerm);

        if (!matchesUser) {
          return false;
        }
      }

      // Filtro por empresa
      if (filters.company && user.company !== filters.company) {
        return false;
      }

      // Filtro por conversaciones
      if (filters.hasConversations) {
        const hasConversations = (user.conversationCount || 0) > 0;
        if (filters.hasConversations === 'yes' && !hasConversations) return false;
        if (filters.hasConversations === 'no' && hasConversations) return false;
      }

      // Filtro por reuniones
      if (filters.hasMeetings) {
        const hasMeetings = (user.meetingCount || 0) > 0;
        if (filters.hasMeetings === 'yes' && !hasMeetings) return false;
        if (filters.hasMeetings === 'no' && hasMeetings) return false;
      }

      // Filtro por fecha
      if (filters.dateFrom || filters.dateTo) {
        const userDate = new Date(user.created_at);
        
        if (filters.dateFrom) {
          const fromDate = new Date(filters.dateFrom);
          if (userDate < fromDate) return false;
        }
        
        if (filters.dateTo) {
          const toDate = new Date(filters.dateTo);
          toDate.setHours(23, 59, 59, 999);
          if (userDate > toDate) return false;
        }
      }

      return true;
    });
  }, [users, filters]);

  // Función para limpiar filtros
  const clearFilters = () => {
    setFilters({
      searchTerm: '',
      company: '',
      hasConversations: '',
      hasMeetings: '',
      dateFrom: '',
      dateTo: ''
    });
  };

  // Obtener opciones únicas para los filtros
  const companyOptions = useMemo(() => {
    const companies = Array.from(new Set(users.map(u => u.company).filter(Boolean)));
    return companies;
  }, [users]);

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
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestión de Usuarios</h1>
            <p className="mt-1 text-sm text-gray-600">
              Administra los usuarios del sistema ({stats.totalUsers} usuarios totales)
            </p>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={clsx(
                'inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md transition-colors',
                showFilters ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700 bg-white hover:bg-gray-50'
              )}
            >
              <FiFilter className="h-4 w-4 mr-2" />
              Filtros
            </button>
          </div>
        </div>

        {/* Estadísticas */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <FiUser className="h-6 w-6 text-blue-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Usuarios
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.totalUsers}
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
                  <FiMessageCircle className="h-6 w-6 text-green-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Con Conversaciones
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.usersWithConversations}
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
                      Con Reuniones
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.usersWithMeetings}
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
                  <FiX className="h-6 w-6 text-red-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Sin Actividad
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.usersWithoutActivity}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex h-[calc(100vh-16rem)] bg-white rounded-lg shadow overflow-hidden">
          {/* Lista de usuarios */}
          <div className="w-1/2 border-r border-gray-200 flex flex-col">
            {/* Header con búsqueda */}
            <div className="p-4 border-b border-gray-200">
              <div className="relative">
                <FiSearch className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, email, teléfono..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  value={filters.searchTerm}
                  onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                />
              </div>
              <p className="text-sm text-gray-500 mt-2">
                {filteredUsers.length} de {users.length} usuarios
              </p>
            </div>

            {/* Panel de filtros avanzados */}
            {showFilters && (
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <div className="space-y-3">
                  {/* Filtro por empresa */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Empresa
                    </label>
                    <select
                      value={filters.company}
                      onChange={(e) => setFilters(prev => ({ ...prev, company: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">Todas las empresas</option>
                      {companyOptions.map(company => (
                        <option key={company} value={company}>
                          {company}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Filtros de actividad */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Conversaciones
                      </label>
                      <select
                        value={filters.hasConversations}
                        onChange={(e) => setFilters(prev => ({ ...prev, hasConversations: e.target.value }))}
                        className="w-full text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">Todos</option>
                        <option value="yes">Con conversaciones</option>
                        <option value="no">Sin conversaciones</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Reuniones
                      </label>
                      <select
                        value={filters.hasMeetings}
                        onChange={(e) => setFilters(prev => ({ ...prev, hasMeetings: e.target.value }))}
                        className="w-full text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">Todos</option>
                        <option value="yes">Con reuniones</option>
                        <option value="no">Sin reuniones</option>
                      </select>
                    </div>
                  </div>

                  {/* Filtros de fecha */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Desde
                      </label>
                      <input
                        type="date"
                        value={filters.dateFrom}
                        onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                        className="w-full text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-1 focus:ring-indigo-500"
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
                        className="w-full text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Botón limpiar filtros */}
                  {(filters.searchTerm || filters.company || filters.hasConversations || filters.hasMeetings || filters.dateFrom || filters.dateTo) && (
                    <button
                      onClick={clearFilters}
                      className="w-full text-sm text-indigo-600 hover:text-indigo-800 py-1"
                    >
                      <FiX className="inline h-3 w-3 mr-1" />
                      Limpiar filtros
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Lista de usuarios filtrados */}
            <div className="flex-1 overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <FiUser className="h-12 w-12 mb-4" />
                  <p className="text-center">
                    {users.length === 0 ? 'No hay usuarios' : 'No se encontraron usuarios con los filtros aplicados'}
                  </p>
                  {users.length > 0 && (
                    <button
                      onClick={clearFilters}
                      className="mt-2 text-sm text-indigo-600 hover:text-indigo-800"
                    >
                      Limpiar filtros
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      onClick={() => setSelectedUser(user)}
                      className={clsx(
                        'p-4 hover:bg-gray-50 cursor-pointer',
                        selectedUser?.id === user.id ? 'bg-indigo-50 border-r-2 border-indigo-500' : ''
                      )}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                          <FiUser className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {user.full_name || 'Usuario sin nombre'}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {user.email}
                          </p>
                          <div className="flex items-center space-x-4 mt-1">
                            <span className="text-xs text-gray-400">
                              📞 {user.phone}
                            </span>
                            {user.company && (
                              <span className="text-xs text-gray-400">
                                🏢 {user.company}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-4 mt-1">
                            <span className="text-xs text-blue-600">
                              💬 {user.conversationCount || 0} conversaciones
                            </span>
                            <span className="text-xs text-purple-600">
                              📅 {user.meetingCount || 0} reuniones
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            Última actividad: {formatDistanceToNow(new Date(user.lastMessageDate || user.lastActivity || user.created_at), { 
                              addSuffix: true, 
                              locale: es 
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Panel de detalles del usuario */}
          <div className="flex-1 flex flex-col">
            {selectedUser ? (
              <>
                {/* Header del usuario */}
                <div className="p-6 border-b border-gray-200 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center">
                        <FiUser className="h-6 w-6 text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">
                          {selectedUser.full_name || 'Usuario sin nombre'}
                        </h3>
                        <p className="text-sm text-gray-500">
                          ID: {selectedUser.id}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          if (confirm('¿Estás seguro de que quieres eliminar este usuario?')) {
                            deleteUser(selectedUser.id);
                          }
                        }}
                        className="p-2 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50"
                        title="Eliminar usuario"
                      >
                        <FiTrash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Información del usuario */}
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="space-y-6">
                    {/* Información de contacto */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-3">Información de Contacto</h4>
                      <div className="space-y-3">
                        <div className="flex items-center space-x-3">
                          <FiMail className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-900">{selectedUser.email || 'No especificado'}</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <FiPhone className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-900">{selectedUser.phone || 'No especificado'}</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <FiHome className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-900">{selectedUser.company || 'No especificado'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Estadísticas de actividad */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-3">Actividad</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-blue-50 p-3 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <FiMessageCircle className="h-4 w-4 text-blue-600" />
                            <span className="text-sm font-medium text-blue-900">Conversaciones</span>
                          </div>
                          <p className="text-lg font-semibold text-blue-900 mt-1">
                            {selectedUser.conversationCount || 0}
                          </p>
                        </div>
                        <div className="bg-purple-50 p-3 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <FiCalendar className="h-4 w-4 text-purple-600" />
                            <span className="text-sm font-medium text-purple-900">Reuniones</span>
                          </div>
                          <p className="text-lg font-semibold text-purple-900 mt-1">
                            {selectedUser.meetingCount || 0}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Fechas importantes */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-3">Fechas</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500">Registrado:</span>
                          <span className="text-sm text-gray-900">
                            {format(new Date(selectedUser.created_at), 'dd/MM/yyyy HH:mm', { locale: es })}
                          </span>
                        </div>
                        {selectedUser.updated_at && (
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">Última actualización:</span>
                            <span className="text-sm text-gray-900">
                              {format(new Date(selectedUser.updated_at), 'dd/MM/yyyy HH:mm', { locale: es })}
                            </span>
                          </div>
                        )}
                        {selectedUser.lastMessageDate && (
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">Último mensaje:</span>
                            <span className="text-sm text-gray-900">
                              {format(new Date(selectedUser.lastMessageDate), 'dd/MM/yyyy HH:mm', { locale: es })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <FiUser className="h-12 w-12 mx-auto mb-4" />
                  <p className="text-lg font-medium">Selecciona un usuario</p>
                  <p className="text-sm">Elige un usuario de la lista para ver sus detalles</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default UsersPage;
