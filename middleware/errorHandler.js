import { RESPONSE_STATUS } from "../config/constants.js";

export function errorHandler(err, req, res, next) {
  console.error("❌ Error caught by global handler:", err);

  // Error de validación de body
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      status: RESPONSE_STATUS.ERROR,
      message: "JSON inválido en el cuerpo de la petición"
    });
  }

  // Error de limite de payload
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      status: RESPONSE_STATUS.ERROR,
      message: "El cuerpo de la petición es demasiado grande"
    });
  }

  // Errores de Axios (peticiones HTTP)
  if (err.isAxiosError) {
    if (err.response) {
      // El servidor respondió con un status code fuera del rango 2xx
      return res.status(err.response.status || 500).json({
        status: RESPONSE_STATUS.ERROR,
        message: `Error en servicio externo: ${err.response.statusText}`,
        details: process.env.NODE_ENV === "development" ? err.response.data : undefined
      });
    } else if (err.request) {
      // La petición fue hecha pero no se recibió respuesta
      return res.status(503).json({
        status: RESPONSE_STATUS.ERROR,
        message: "Servicio externo no disponible"
      });
    }
  }

  // Errores específicos de servicios
  if (err.message?.includes("YouTube Music")) {
    return res.status(503).json({
      status: RESPONSE_STATUS.ERROR,
      message: "Error en el servicio de YouTube Music",
      details: process.env.NODE_ENV === "development" ? err.message : undefined
    });
  }

  if (err.message?.includes("Spotify")) {
    return res.status(503).json({
      status: RESPONSE_STATUS.ERROR,
      message: "Error en el servicio de Spotify",
      details: process.env.NODE_ENV === "development" ? err.message : undefined
    });
  }

  if (err.message?.includes("AI") || err.message?.includes("Gemini")) {
    return res.status(503).json({
      status: RESPONSE_STATUS.ERROR,
      message: "Error en el servicio de IA",
      details: process.env.NODE_ENV === "development" ? err.message : undefined
    });
  }

  // Error de token de Spotify inválido/expirado
  if (err.message?.includes("invalid") && err.message?.includes("token")) {
    return res.status(401).json({
      status: RESPONSE_STATUS.ERROR,
      message: "Token de acceso inválido o expirado"
    });
  }

  // Error genérico del servidor
  return res.status(500).json({
    status: RESPONSE_STATUS.ERROR,
    message: "Error interno del servidor",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined
  });
}

// Middleware para manejar rutas no encontradas
export function notFoundHandler(req, res) {
  res.status(404).json({
    status: RESPONSE_STATUS.ERROR,
    message: `Ruta no encontrada: ${req.method} ${req.path}`,
    availableRoutes: {
      playlists: [
        "POST /api/playlists/generate",
        "GET /api/playlists/:playlistId",
        "POST /api/playlists/validate-spotify",
        "GET /api/playlists/stats"
      ],
      spotify: [
        "POST /api/spotify/create-from-generated",
        "POST /api/spotify/create-direct",
        "POST /api/spotify/profile"
      ]
    }
  });
} 