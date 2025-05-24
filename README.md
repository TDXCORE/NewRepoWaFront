# FullStackAgent Frontend

Frontend moderno para el sistema de gestión de leads TDX Agent, desarrollado con React, Next.js y integración completa con WebSockets.

## 🚀 Características

- **Dashboard interactivo** con métricas en tiempo real
- **Chat en tiempo real** con integración WebSocket
- **Calendario** para gestión de reuniones
- **Gestión de usuarios** con exportación de datos
- **Responsive design** optimizado para móvil y desktop
- **Conexión en tiempo real** con el backend via WebSockets

## 🛠️ Instalación

1. **Instalar dependencias**:
```bash
npm install
```

2. **Configurar variables de entorno**:
```bash
cp .env.example .env.local
```

3. **Asegurar que el backend esté ejecutándose**:
```bash
# En el directorio raíz del proyecto
python -m App.api
```

4. **Iniciar el frontend**:
```bash
npm run dev
```

5. **Abrir en el navegador**: http://localhost:3000

## 📱 Páginas

- **Dashboard** (`/`) - Métricas y estadísticas
- **Conversaciones** (`/chats`) - Chat en tiempo real
- **Calendario** (`/calendar`) - Gestión de reuniones
- **Usuarios** (`/users`) - Administración de usuarios

## 🔌 Integración WebSocket

El frontend se conecta automáticamente al backend WebSocket en `ws://localhost:8000/ws`

## 🎨 Tecnologías

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- WebSockets
- React Query
- Recharts

---

Desarrollado para TDX Core