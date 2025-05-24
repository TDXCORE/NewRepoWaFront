import React, { useEffect, useState } from 'react';
import MainLayout from '../components/Layout/MainLayout';
import { useWebSocket } from '../contexts/WebSocketContext';
import { FiUser, FiMail, FiPhone, FiSearch } from 'react-icons/fi';
import { format } from 'date-fns';
import type { User } from '../services/websocket';

const UsersPage: React.FC = () => {
  const { ws, isConnected } = useWebSocket();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

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
      console.log('🔄 Cargando usuarios...');
      
      const usersData = await ws.getUsers();
      console.log('👥 Usuarios obtenidos:', usersData);
      
      setUsers(usersData.users || []);
    } catch (error) {
      console.error('❌ Error cargando usuarios:', error);
      setUsers([]); // Establecer array vacío en caso de error
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    return (
      user.full_name?.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower) ||
      user.phone?.toLowerCase().includes(searchLower) ||
      user.company?.toLowerCase().includes(searchLower)
    );
  });

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
              {users.length} usuarios registrados en el sistema
            </p>
          </div>
        </div>

        {/* Búsqueda */}
        <div className="mb-6 bg-white rounded-lg shadow p-4">
          <div className="relative">
            <FiSearch className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, email, teléfono o empresa..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Tabla de usuarios */}
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Usuario
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contacto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Registro
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0">
                          <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                            <FiUser className="h-5 w-5 text-indigo-600" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.full_name || 'Sin nombre'}
                          </div>
                          {user.company && (
                            <div className="text-sm text-gray-500">
                              {user.company}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        <div className="flex items-center mb-1">
                          <FiMail className="h-3 w-3 mr-1 text-gray-400" />
                          {user.email || 'No disponible'}
                        </div>
                        <div className="flex items-center">
                          <FiPhone className="h-3 w-3 mr-1 text-gray-400" />
                          {user.phone || 'No disponible'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {format(new Date(user.created_at), 'dd/MM/yyyy')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {filteredUsers.length === 0 && (
            <div className="text-center py-12">
              <FiUser className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No se encontraron usuarios</h3>
              <p className="mt-1 text-sm text-gray-500">
                Intenta cambiar los filtros de búsqueda.
              </p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default UsersPage;
