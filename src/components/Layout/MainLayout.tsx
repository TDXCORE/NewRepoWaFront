import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { FiHome, FiMessageSquare, FiCalendar, FiUsers, FiMenu, FiX, FiWifi, FiWifiOff } from 'react-icons/fi';
import { useWebSocket } from '../../contexts/WebSocketContext';
import clsx from 'clsx';

interface MainLayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: FiHome },
  { name: 'Conversaciones', href: '/chats', icon: FiMessageSquare },
  { name: 'Calendario', href: '/calendar', icon: FiCalendar },
  { name: 'Usuarios', href: '/users', icon: FiUsers },
];

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const { isConnected, connectionStatus } = useWebSocket();

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100">
      {/* Sidebar */}
      <div className="hidden md:flex md:flex-shrink-0">
        <div className="flex flex-col w-64">
          <div className="flex flex-col h-0 flex-1 border-r border-gray-200 bg-white">
            {/* Logo */}
            <div className="flex items-center h-16 flex-shrink-0 px-4 bg-indigo-600">
              <h1 className="text-white font-bold text-xl">TDX Agent</h1>
            </div>
            
            {/* Navegación */}
            <div className="flex-1 flex flex-col overflow-y-auto">
              <nav className="flex-1 px-2 py-4 space-y-1">
                {navigation.map((item) => {
                  const isActive = router.pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={clsx(
                        isActive
                          ? 'bg-indigo-100 border-indigo-500 text-indigo-700'
                          : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                        'group flex items-center px-3 py-2 text-sm font-medium border-l-4'
                      )}
                    >
                      <item.icon className={clsx(isActive ? 'text-indigo-500' : 'text-gray-400', 'mr-3 h-5 w-5')} />
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
              
              {/* Estado de conexión */}
              <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
                <div className={clsx(
                  "flex items-center space-x-2 px-2 py-1 rounded text-sm",
                  {
                    'bg-green-50 text-green-700': isConnected,
                    'bg-red-50 text-red-700': !isConnected
                  }
                )}>
                  {isConnected ? <FiWifi className="w-4 h-4" /> : <FiWifiOff className="w-4 h-4" />}
                  <span>{isConnected ? 'Conectado' : 'Desconectado'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        {/* Header */}
        <div className="relative z-10 flex-shrink-0 flex h-16 bg-white shadow">
          <div className="flex-1 px-4 flex justify-between items-center">
            <h1 className="text-lg font-semibold text-gray-900">
              {navigation.find(item => item.href === router.pathname)?.name || 'TDX Agent'}
            </h1>
          </div>
        </div>

        {/* Contenido */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          <div className="py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;