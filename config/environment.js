/**
 * Configuración centralizada de entorno para EmotionQuest Backend
 * Maneja automáticamente desarrollo y producción
 */

const isDevelopment = process.env.NODE_ENV !== 'production';
const isProduction = process.env.NODE_ENV === 'production';

// Configuración de URLs base
const BACKEND_CONFIG = {
  development: {
    backendUrl: process.env.BACKEND_URL || "http://127.0.0.1:3000",
    frontendUrl: process.env.FRONTEND_URL_DEV || "http://localhost:5173",
    corsOrigins: [
      "http://localhost:5173",
      "http://127.0.0.1:5173"
    ]
  },
  production: {
    backendUrl: process.env.BASE_URL_PROD || "https://emotionquest-backend-189934902436.us-central1.run.app",
    frontendUrl: process.env.FRONTEND_URL_PROD || "https://emotionquest.vercel.app",
    corsOrigins: [
      "https://emotionquest.vercel.app",
      "https://emotionquest-git-master-pixeldroid19s-projects.vercel.app",
      "https://emotionquest-o20f2c1qg-pixeldroid19s-projects.vercel.app"
    ]
  }
};

const currentConfig = isProduction ? BACKEND_CONFIG.production : BACKEND_CONFIG.development;

// Configuración exportada
export const ENV_CONFIG = {
  // Ambiente
  NODE_ENV: process.env.NODE_ENV || 'development',
  isDevelopment,
  isProduction,
  
  // URLs
  BACKEND_URL: currentConfig.backendUrl,
  FRONTEND_URL: currentConfig.frontendUrl,
  
  // CORS
  CORS_ORIGINS: currentConfig.corsOrigins,
  
  // Spotify
  SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
  
  // Google AI
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  
  // Puerto
  PORT: process.env.PORT || 3000,
  
  // Debug
  DEBUG: process.env.DEBUG === 'true' || isDevelopment
};

// Log de configuración en desarrollo
if (ENV_CONFIG.DEBUG) {
  console.log('🔧 Backend Environment Configuration:', {
    environment: ENV_CONFIG.NODE_ENV,
    backendUrl: ENV_CONFIG.BACKEND_URL,
    frontendUrl: ENV_CONFIG.FRONTEND_URL,
    corsOrigins: ENV_CONFIG.CORS_ORIGINS,
    hasSpotifyCredentials: !!(ENV_CONFIG.SPOTIFY_CLIENT_ID && ENV_CONFIG.SPOTIFY_CLIENT_SECRET),
    hasGoogleApiKey: !!ENV_CONFIG.GOOGLE_API_KEY,
    port: ENV_CONFIG.PORT
  });
}

export default ENV_CONFIG; 