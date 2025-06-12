import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import rateLimit from "express-rate-limit";

import playlistRoutes from "./routes/playlistRoutes.js";
import spotifyRoutes from "./routes/spotifyRoutes.js";
import spotifyAuthRoutes from "./routes/spotifyAuth.js";

import {
  generalLimiter,
  playlistGenerationLimiter,
  spotifyLimiter,
  playlistRetrievalLimiter,
} from "./middleware/rateLimiter.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

let RESPONSE_STATUS;
let initializeDatabase;

const app = express();
const PORT = process.env.PORT || 8080;

function validateEnvironment() {
  console.log("🔍 Validando variables de entorno...");
  
  // Variables críticas que DEBEN estar presentes
  const criticalVariables = [
    "SPOTIFY_CLIENT_ID",
    "SPOTIFY_CLIENT_SECRET",
  ];

  // Variables opcionales pero recomendadas
  const optionalVariables = [
    "FRONTEND_URL",
    "MONGODB_URI",
    "GOOGLE_API_KEY"
  ];

  const missingCritical = criticalVariables.filter(
    (variable) => !process.env[variable]
  );

  const missingOptional = optionalVariables.filter(
    (variable) => !process.env[variable]
  );

  // Log de todas las variables para debugging
  console.log("📋 Estado de variables de entorno:");
  [...criticalVariables, ...optionalVariables].forEach(variable => {
    const value = process.env[variable];
    console.log(`  ${variable}: ${value ? '✅ configurada' : '❌ faltante'}`);
  });

  // Solo fallar si faltan variables críticas
  if (missingCritical.length > 0) {
    console.error(
      "❌ Error: Las siguientes variables CRÍTICAS no están definidas:",
      missingCritical.join(", ")
    );
    process.exit(1);
  }

  // Advertir sobre variables opcionales faltantes
  if (missingOptional.length > 0) {
    console.warn(
      "⚠️ Advertencia: Las siguientes variables OPCIONALES no están definidas:",
      missingOptional.join(", ")
    );
    console.warn("La aplicación funcionará con funcionalidad limitada.");
  }

  console.log("✅ Variables de entorno críticas validadas.");
}

validateEnvironment();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(compression());

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://emotionquest-backend-189934902436.us-central1.run.app",
    "https://emotionquest.vercel.app",
    "https://emotionquest-git-master-pixeldroid19s-projects.vercel.app",
    "https://emotionquest-o20f2c1qg-pixeldroid19s-projects.vercel.app",
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

app.use(
  express.json({
    limit: "10mb",
    strict: true,
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

if (process.env.NODE_ENV === "production") {
  app.use(morgan("combined"));
} else {
  app.use(morgan("dev"));
}

app.use(generalLimiter);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    status: "error",
    message: "Demasiadas solicitudes. Intenta de nuevo en 15 minutos.",
  },
});
app.use(limiter);

// Health check básico (antes de inicialización de servicios)
app.get("/health", (req, res) => {
  res.status(200).json({
    status: RESPONSE_STATUS?.SUCCESS || "ok",
    message: "Servidor funcionando correctamente",
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

function setupRoutes() {
  app.get("/", (req, res) => {
    res.json({
      status: RESPONSE_STATUS.SUCCESS,
      message: "🎼 Music App Backend - API de Música Clásica",
      version: "1.0.0",
      endpoints: {
        playlists: "/api/playlists",
        spotify: "/api/spotify",
        health: "/health",
        docs: "/api-docs",
      },
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/health", (req, res) => {
    res.json({
      status: RESPONSE_STATUS?.SUCCESS || "ok",
      message: "Servidor funcionando correctamente",
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      env: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
    });
  });
}

app.use("/api/playlists/generate", playlistGenerationLimiter);
app.use("/api/playlists/system/stats", playlistRetrievalLimiter);
app.use("/api/playlists/:playlistId", playlistRetrievalLimiter);
app.use("/api/playlists", playlistRoutes);

app.use("/api/spotify", spotifyLimiter, spotifyRoutes);

app.use("/api/spotify", spotifyAuthRoutes);

app.get("/api-docs", (req, res) => {
  res.json({
    status: RESPONSE_STATUS.SUCCESS,
    message: "Documentación de la API",
    baseUrl: `${req.protocol}://${req.get("host")}`,
    endpoints: {
      playlists: {
        "POST /api/playlists/generate": {
          description: "Genera una nueva playlist de música clásica",
          body: {
            userDescription:
              "string (requerido) - Descripción del estado de ánimo deseado",
            language:
              "string (opcional) - Idioma/región de preferencia musical",
          },
          response: "Playlist con canciones de YouTube Music",
        },
        "GET /api/playlists/:playlistId": {
          description: "Obtiene una playlist por ID",
          params: {
            playlistId: "string - UUID de la playlist",
          },
        },
        "POST /api/playlists/validate-spotify": {
          description: "Valida canciones en Spotify",
          body: {
            songs: "Array - Lista de canciones a validar",
            spotifyAccessToken: "string (opcional) - Token de Spotify",
          },
        },
        "GET /api/playlists/stats": {
          description: "Obtiene estadísticas del sistema",
        },
      },
      spotify: {
        "POST /api/spotify/create-from-generated": {
          description: "Crea playlist en Spotify desde una generada",
          body: {
            spotifyAccessToken: "string (requerido)",
            playlistId: "string (requerido)",
            customTitle: "string (opcional)",
            customDescription: "string (opcional)",
          },
        },
        "POST /api/spotify/create-direct": {
          description: "Crea playlist en Spotify directamente",
          body: {
            spotifyAccessToken: "string (requerido)",
            userDescription: "string (requerido)",
            language: "string (opcional)",
            useAudioFeatures: "boolean (opcional)",
          },
        },
        "POST /api/spotify/profile": {
          description: "Obtiene perfil del usuario de Spotify",
          body: {
            spotifyAccessToken: "string (requerido)",
          },
        },
        "GET /api/spotify/login": {
          description: "Inicia el flujo de autenticación con Spotify",
          query: {
            redirect_uri:
              "string (requerido) - URL de redirección después de autenticación",
          },
        },
        "GET /api/spotify/callback": {
          description:
            "Endpoint para recibir el callback de Spotify (uso interno)",
        },
        "POST /api/spotify/token": {
          description: "Intercambia código de autorización por token",
          body: {
            code: "string (requerido) - Código de autorización",
            redirectUri: "string (requerido) - URL de redirección usada",
          },
        },
        "POST /api/spotify/refresh": {
          description: "Refresca un token de acceso expirado",
          body: {
            refreshToken: "string (requerido) - Token de refresco",
          },
        },
        "GET /api/spotify/validate": {
          description: "Valida un token de acceso",
          headers: {
            Authorization: "string (requerido) - Bearer {token}",
          },
        },
      },
    },
    rateLimits: {
      general: "100 requests / 15 minutos",
      playlistGeneration: "10 requests / 5 minutos",
      spotify: "15 requests / 2 minutos",
      retrieval: "50 requests / 1 minuto",
    },
  });
});

app.use(notFoundHandler);

app.use(errorHandler);

async function initializeServices() {
  console.log("🔧 Inicializando servicios...");
  
  try {
    // Cargar constantes (crítico)
    console.log("📦 Cargando constantes...");
    const { RESPONSE_STATUS: ResponseStatus } = await import(
      "./config/constants.js"
    );
    RESPONSE_STATUS = ResponseStatus;
    console.log("✅ Constantes cargadas");

    // Configurar rutas (crítico)
    console.log("🛣️ Configurando rutas...");
    setupRoutes();
    console.log("✅ Rutas configuradas");

    // Inicializar servicios opcionales
    try {
      console.log("🎵 Inicializando YouTube Music Service...");
      const { youtubeMusicService } = await import(
        "./services/youtubeMusicService.js"
      );
      await youtubeMusicService.initialize();
      console.log("✅ YouTube Music Service inicializado");
    } catch (error) {
      console.warn("⚠️ YouTube Music Service no pudo inicializarse:", error.message);
      console.warn("La aplicación funcionará sin este servicio");
    }

    // Inicializar base de datos (opcional)
    try {
      console.log("🗄️ Inicializando base de datos...");
      const { initializeDatabase: initDB } = await import("./config/database.js");
      initializeDatabase = initDB;
      await initializeDatabase();
      console.log("✅ Base de datos inicializada");
    } catch (error) {
      console.warn("⚠️ Base de datos no pudo inicializarse:", error.message);
      console.warn("La aplicación funcionará sin persistencia de datos");
    }

    console.log("🎉 Inicialización de servicios completada");
  } catch (error) {
    console.error("❌ Error crítico inicializando servicios:", error);
    console.error("Stack trace:", error.stack);
    throw error; // Re-lanzar solo errores críticos
  }
}

initializeServices()
  .then(() => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Music App Backend running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`📡 Server listening on: http://0.0.0.0:${PORT}`);
      console.log(`📚 Documentation at: http://0.0.0.0:${PORT}/api-docs`);
      console.log(`❤️ Health check at: http://0.0.0.0:${PORT}/health`);
      console.log(`⏰ Started at: ${new Date().toISOString()}`);
    });

    // Manejo de errores del servidor
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
      } else {
        console.error('❌ Server error:', error);
      }
      process.exit(1);
    });

    // Graceful shutdown
    const gracefulShutdown = (signal) => {
      console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
      server.close(() => {
        console.log('✅ Server closed successfully');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  })
  .catch((error) => {
    console.error("❌ Failed to start server:", error);
    console.error("Stack trace:", error.stack);
    process.exit(1);
  });

// Manejo global de errores no capturados
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  console.error("Stack trace:", error.stack);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("🚫 Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});