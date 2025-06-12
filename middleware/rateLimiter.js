import rateLimit from "express-rate-limit";

// Rate limiter general para todas las rutas
export const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos por defecto
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 100 requests por ventana por defecto
  message: {
    status: "error",
    message: "Demasiadas solicitudes. Intenta de nuevo más tarde.",
    retryAfter: "15 minutos"
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter más estricto para generación de playlists (computacionalmente costoso)
export const playlistGenerationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 10, // 10 generaciones por 5 minutos
  message: {
    status: "error",
    message: "Límite de generación de playlists alcanzado. Intenta de nuevo en 5 minutos.",
    retryAfter: "5 minutos"
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter para operaciones de Spotify (para proteger tokens de usuario)
export const spotifyLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, // 2 minutos
  max: 15, // 15 operaciones por 2 minutos
  message: {
    status: "error",
    message: "Límite de operaciones de Spotify alcanzado. Intenta de nuevo en 2 minutos.",
    retryAfter: "2 minutos"
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter muy permisivo para obtener playlists ya generadas
export const playlistRetrievalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 50, // 50 retrievals por minuto
  message: {
    status: "error",
    message: "Demasiadas solicitudes de consulta. Intenta de nuevo en 1 minuto.",
    retryAfter: "1 minuto"
  },
  standardHeaders: true,
  legacyHeaders: false,
}); 