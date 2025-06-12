# 🎼 Music App Backend

Backend para aplicación de música clásica que genera playlists usando IA y las hace disponibles en YouTube Music y opcionalmente en Spotify.

## 🚀 Características

- **Generación de Playlists con IA**: Usa Google Gemini para crear playlists de música clásica basadas en descripción del usuario
- **YouTube Music Principal**: Busca y reproduce música de YouTube Music como servicio principal
- **Spotify Opcional**: Crea playlists en Spotify para usuarios autenticados
- **Cache Inteligente**: Sistema de cache en memoria para optimizar rendimiento
- **Rate Limiting**: Protección contra abuso con límites configurables
- **Manejo de Errores**: Sistema robusto de manejo de errores y logging

## 🏗️ Arquitectura

### Flujo Principal (YouTube Music)
1. **Usuario** envía descripción → **IA (Gemini)** genera lista de canciones
2. **Backend** busca canciones en **YouTube Music** usando `ytmusic-api`
3. **Usuario** recibe playlist con enlaces de reproducción de YouTube

### Flujo Opcional (Spotify)
1. **Usuario autenticado con Spotify** solicita crear playlist
2. **Backend** toma la misma lista y busca en **Spotify**
3. **Backend** crea playlist en la cuenta del usuario

## 📦 Instalación

### Prerrequisitos
- Node.js 18+ 
- npm o yarn
- Cuentas de API:
  - Google AI (Gemini) - **requerido**
  - Spotify Developer - opcional

### 1. Clonar e instalar dependencias

```bash
git clone <repository-url>
cd music-app-backend
npm install
```

### 2. Configurar variables de entorno

Copia `env.example` a `.env` y configura:

```bash
cp env.example .env
```

```env
# Configuración del servidor
PORT=3000
NODE_ENV=development

# Google AI (Gemini) - REQUERIDO
GOOGLE_API_KEY=tu_google_api_key_aqui

# Spotify (opcional)
SPOTIFY_CLIENT_ID=tu_spotify_client_id_aqui
SPOTIFY_CLIENT_SECRET=tu_spotify_client_secret_aqui

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:5173
```

### 3. Obtener API Keys

#### Google AI (Gemini) - REQUERIDO
1. Ve a [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Crea un proyecto y obtén tu API key
3. Agrega la key a `GOOGLE_API_KEY` en tu `.env`

#### Spotify (Opcional)
1. Ve a [Spotify for Developers](https://developer.spotify.com/dashboard/applications)
2. Crea una nueva aplicación
3. Obtén `Client ID` y `Client Secret`
4. Agrégalos a tu `.env`

### 4. Ejecutar el servidor

```bash
# Desarrollo
npm run dev

# Producción
npm start
```

El servidor estará disponible en `http://localhost:3000`

## 🛠️ API Endpoints

### 📝 Playlists

#### `POST /api/playlists/generate`
Genera una nueva playlist de música clásica.

```bash
curl -X POST http://localhost:3000/api/playlists/generate \
  -H "Content-Type: application/json" \
  -d '{
    "userDescription": "música relajante para estudiar",
    "language": "any"
  }'
```

**Respuesta:**
```json
{
  "status": "success",
  "message": "Playlist generada exitosamente",
  "data": {
    "id": "uuid-playlist",
    "title": "Concentración Serena",
    "description": "Música clásica suave para estudiar...",
    "totalSongs": 10,
    "songs": [
      {
        "title": "Clair de Lune",
        "artist": "Claude Debussy",
        "videoId": "CvFH_6DNRCY",
        "playbackUrl": "https://www.youtube.com/watch?v=CvFH_6DNRCY",
        "duration": {...},
        "thumbnails": {...}
      }
    ]
  }
}
```

#### `GET /api/playlists/:playlistId`
Obtiene una playlist previamente generada.

#### `POST /api/playlists/validate-spotify`
Valida qué canciones están disponibles en Spotify.

#### `GET /api/playlists/stats`
Obtiene estadísticas del sistema.

### 🎵 Spotify

#### `POST /api/spotify/create-from-generated`
Crea una playlist en Spotify desde una generada previamente.

```bash
curl -X POST http://localhost:3000/api/spotify/create-from-generated \
  -H "Content-Type: application/json" \
  -d '{
    "spotifyAccessToken": "tu_access_token",
    "playlistId": "uuid-playlist",
    "customTitle": "Mi Playlist Personalizada"
  }'
```

#### `POST /api/spotify/create-direct`
Crea una playlist directamente en Spotify desde una descripción.

```bash
curl -X POST http://localhost:3000/api/spotify/create-direct \
  -H "Content-Type: application/json" \
  -d '{
    "spotifyAccessToken": "tu_access_token",
    "userDescription": "música energética para hacer ejercicio",
    "useAudioFeatures": true
  }'
```

#### `POST /api/spotify/profile`
Obtiene el perfil del usuario de Spotify.

## 🔒 Rate Limiting

- **General**: 100 requests / 15 minutos
- **Generación de Playlists**: 10 requests / 5 minutos
- **Operaciones Spotify**: 15 requests / 2 minutos
- **Consultas**: 50 requests / 1 minuto

## 🎯 Estados de Ánimo Soportados

El sistema detecta automáticamente estos estados de ánimo:

- **ANGRY/INTENSE**: Beethoven, Wagner, Stravinsky
- **HAPPY/JOYFUL**: Mozart, Vivaldi, Rossini
- **SLEEP/RELAXING**: Debussy, Satie, Chopin Nocturnos
- **MAGIC/MYSTICAL**: Ravel, Debussy, Grieg
- **SAD/MELANCHOLIC**: Chopin, Schubert, Barber
- **PARTY/FESTIVE**: Strauss, Offenbach, Brahms

## 🐛 Debugging

### Logs del Sistema
```bash
# Ver logs en tiempo real
npm run dev

# Ver solo errores
NODE_ENV=production npm start 2>&1 | grep "❌\|💥"
```

### Endpoints de Salud
- `GET /health` - Estado del servidor
- `GET /api/playlists/stats` - Estadísticas del cache y servicios

### Problemas Comunes

#### YouTube Music no encuentra canciones
- Verifica que los nombres de compositores/piezas sean precisos
- El servicio puede tardar en inicializarse la primera vez

#### Spotify API retorna errores 401
- Verifica que el `spotifyAccessToken` sea válido
- Asegúrate de que el token tenga los scopes necesarios

#### Error de Google AI
- Verifica que `GOOGLE_API_KEY` esté configurado
- Asegúrate de que la API esté habilitada en tu proyecto de Google

## 🚀 Deployment

### Variables de Entorno para Producción
```env
NODE_ENV=production
PORT=3000
GOOGLE_API_KEY=tu_api_key_de_produccion
SPOTIFY_CLIENT_ID=tu_client_id_de_produccion
SPOTIFY_CLIENT_SECRET=tu_client_secret_de_produccion
CORS_ORIGIN=https://tu-frontend-domain.com
```

### Docker (Opcional)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🤝 Contribución

1. Fork el proyecto
2. Crea una branch para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la branch (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

## 🎵 Tecnologías Utilizadas

- **Node.js + Express** - Servidor web
- **Google Generative AI** - Generación de playlists con IA
- **ytmusic-api** - Búsqueda en YouTube Music
- **Spotify Web API** - Integración con Spotify
- **Axios** - Cliente HTTP
- **Express Rate Limit** - Rate limiting
- **Helmet** - Seguridad HTTP
- **Morgan** - Logging HTTP
- **CORS** - Cross-Origin Resource Sharing

---

Hecho con ❤️ para los amantes de la música clásica 