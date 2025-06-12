# Configuración OAuth PKCE de Spotify - Sistema Integrado

## Resumen de los cambios implementados

Se ha implementado completamente el flujo **Authorization Code with PKCE** de Spotify siguiendo la documentación oficial, integrado con tu sistema de autenticación existente usando **ventanas popup** en lugar de redirecciones completas de página.

## Características principales

### ✅ **Autenticación con popup**
- No interrumpe el flujo de la aplicación principal
- Ventana popup segura para autorización
- Compatible con aplicaciones de una sola página (SPA)

### ✅ **Persistencia mejorada**
- Almacenamiento local de tokens con expiración
- Renovación automática de tokens
- Restauración de sesión al recargar
- Manejo de sesiones temporales en el backend

### ✅ **Compatibilidad total**
- Funciona con el contexto existente de tu app
- Compatible con Zustand store
- Mantiene la funcionalidad existente

## Configuración necesaria

### 1. Variables de entorno del backend

Asegúrate de tener estas variables en tu archivo `.env`:

```env
SPOTIFY_CLIENT_ID=tu_client_id_de_spotify
SPOTIFY_CLIENT_SECRET=tu_client_secret_de_spotify
```

### 2. Configuración en Spotify Developer Dashboard

1. Ve a [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Crea una nueva aplicación o edita una existente
3. En **Settings**, agrega estas **Redirect URIs**:
   - `http://localhost:5173/?callback=spotify` (para desarrollo local Vite)
   - `http://localhost:3000/?callback=spotify` (para desarrollo local)
   - `https://tudominio.com/?callback=spotify` (para producción)

**Nota:** El callback ahora usa parámetros de query en lugar de rutas separadas.

## Nuevas rutas del backend

### Autenticación OAuth

- `POST /api/spotify/auth/init` - Inicia el flujo OAuth
- `POST /api/spotify/auth/callback` - Maneja el callback de OAuth
- `POST /api/spotify/auth/refresh` - Refresca tokens expirados
- `POST /api/spotify/auth/verify` - Verifica si un token es válido
- `POST /api/spotify/auth/session` - Obtiene datos de sesión almacenados

### Rutas existentes (sin cambios)

- `POST /api/spotify/create-from-generated`
- `POST /api/spotify/create-direct`
- `POST /api/spotify/profile`

## Componentes del frontend actualizados

### SpotifyAuth.jsx (completamente rediseñado)
- ✅ **Autenticación popup**: Ventana popup en lugar de redirecciones
- ✅ **Manejo automático de callback**: Detecta y procesa automáticamente los callbacks
- ✅ **Persistencia inteligente**: Almacena y restaura sesiones automáticamente
- ✅ **Renovación automática**: Tokens se renuevan sin intervención del usuario
- ✅ **Estados de carga**: Indicadores claros del progreso de autenticación
- ✅ **Compatibilidad dual**: Funciona con contexto y Zustand store

### Componentes eliminados
- ❌ **SpotifyCallback.jsx**: Ya no es necesario, funcionalidad integrada

## Flujo de autenticación mejorado

### 1. **Usuario hace clic en "Conectar con Spotify"**
- El frontend llama a `/api/spotify/auth/init`
- Se abre una ventana popup con la URL de autorización de Spotify
- El usuario autoriza en la ventana popup

### 2. **Spotify redirige al callback**
- La ventana popup recibe el callback con el código de autorización
- Se procesa el intercambio de código por token
- La ventana popup comunica el resultado a la ventana principal
- La ventana popup se cierra automáticamente

### 3. **Tokens almacenados y persistencia**
- Tokens se guardan en localStorage y en el backend temporalmente
- Renovación automática cuando expiran usando refresh tokens
- Restauración de sesión al recargar la página
- Verificación periódica de validez de tokens

## Ventajas de esta implementación

- ✅ **UX superior**: Sin redirecciones que interrumpan el flujo
- ✅ **Seguridad**: No se exponen client_secrets en el frontend
- ✅ **Persistencia robusta**: Múltiples capas de almacenamiento y recuperación
- ✅ **Renovación inteligente**: Manejo automático de expiración de tokens
- ✅ **Compatibilidad**: Funciona con la estructura existente
- ✅ **PKCE completo**: Implementa el estándar de seguridad recomendado
- ✅ **Manejo de errores**: Gestión completa de errores y estados

## Almacenamiento de datos

### LocalStorage (Frontend)
```javascript
spotify_access_token      // Token de acceso actual
spotify_refresh_token     // Token para renovación
spotify_session_id        // ID de sesión en el backend
spotify_token_expires_at  // Timestamp de expiración
spotify_oauth_state       // Estado para validación CSRF (temporal)
```

### Memoria temporal (Backend)
- **tempCodeVerifiers**: Almacena code verifiers durante el flujo OAuth (10 min)
- **tempUserSessions**: Almacena datos de sesión del usuario (1 hora)

## Configuración para producción

1. Actualizar las Redirect URIs en Spotify Dashboard
2. Configurar variables de entorno en el servidor
3. Asegurar HTTPS para la aplicación en producción
4. Ajustar la configuración de CORS si es necesario

## Troubleshooting

### Error: "Estado inválido"
- Verifica que las Redirect URIs coincidan exactamente
- Asegúrate de que incluyan `?callback=spotify` al final

### Error: "Popup bloqueado"
- Algunos navegadores bloquean popups automáticos
- El usuario debe permitir popups para tu dominio

### Error: "Client ID inválido"
- Verifica que `SPOTIFY_CLIENT_ID` esté correctamente configurado
- Asegúrate de que la aplicación esté activada en Spotify Dashboard

### Error: "Redirect URI inválido"
- Verifica que la URI esté registrada exactamente como `https://tudominio.com/?callback=spotify`
- No olvides el parámetro `callback=spotify`

## Integración con tu aplicación

El componente `SpotifyAuth` ahora se integra perfectamente con tu sistema:

```jsx
// En cualquier componente
import SpotifyAuth from './components/SpotifyAuth';

// Uso básico (con contexto)
<SpotifyAuth />

// Uso avanzado (con callback personalizado)
<SpotifyAuth onAuth={(token, user) => {
  console.log('Usuario autenticado:', user);
  // Tu lógica personalizada aquí
}} />
```

La autenticación funciona sin necesidad de configurar rutas adicionales en tu aplicación React. 