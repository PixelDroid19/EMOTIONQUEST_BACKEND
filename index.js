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
const PORT = process.env.PORT || 3000;

function validateEnvironment() {
  const requiredVariables = [
    "SPOTIFY_CLIENT_ID",
    "SPOTIFY_CLIENT_SECRET",
    "FRONTEND_URL",
    "MONGODB_URI", // Ejemplo, agrega tus variables de base de datos
  ];

  const missingVariables = requiredVariables.filter(
    (variable) => !process.env[variable]
  );

  if (missingVariables.length > 0) {
    console.error(
      "Error: Las siguientes variables de entorno no están definidas:",
      missingVariables.join(", ")
    );
    process.exit(1);
  }

  console.log("✅ Variables de entorno validadas.");
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
      status: RESPONSE_STATUS.SUCCESS,
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
  try {
    const { RESPONSE_STATUS: ResponseStatus } = await import(
      "./config/constants.js"
    );
    const { initializeDatabase: initDB } = await import("./config/database.js");

    RESPONSE_STATUS = ResponseStatus;
    initializeDatabase = initDB;

    setupRoutes();

    const { youtubeMusicService } = await import(
      "./services/youtubeMusicService.js"
    );
    await youtubeMusicService.initialize();

    await initializeDatabase();
  } catch (error) {
    console.error("Error initializing services:", error);
    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

initializeServices()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Music App Backend running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`API available at: http://localhost:${PORT}`);
      console.log(`Documentation at: http://localhost:${PORT}/api-docs`);
      console.log(`Health check at: http://localhost:${PORT}/health`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });