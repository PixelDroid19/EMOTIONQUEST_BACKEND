import express from "express";
import {
  createSpotifyPlaylistFromGenerated,
  createSpotifyPlaylistDirect,
  getSpotifyProfile,
  initSpotifyAuth,
  handleSpotifyCallback,
  refreshSpotifyAccessToken,
  verifySpotifyToken,
  getSpotifySession
} from "../controllers/spotifyController.js";

const router = express.Router();

/**
 * Rutas de autenticación OAuth PKCE
 */

/**
 * @route POST /api/spotify/auth/init
 * @desc Inicia el flujo de autenticación OAuth PKCE
 * @body { redirectUri: string }
 */
router.post("/auth/init", initSpotifyAuth);

/**
 * @route POST /api/spotify/auth/callback
 * @desc Maneja el callback de OAuth y intercambia código por token
 * @body { code: string, state: string }
 */
router.post("/auth/callback", handleSpotifyCallback);

/**
 * @route POST /api/spotify/auth/refresh
 * @desc Refresca un token de acceso usando refresh token
 * @body { refreshToken: string, sessionId?: string }
 */
router.post("/auth/refresh", refreshSpotifyAccessToken);

/**
 * @route POST /api/spotify/auth/verify
 * @desc Verifica si un token de acceso es válido
 * @body { accessToken: string }
 */
router.post("/auth/verify", verifySpotifyToken);

/**
 * @route POST /api/spotify/auth/session
 * @desc Obtiene datos de sesión almacenados temporalmente
 * @body { sessionId: string }
 */
router.post("/auth/session", getSpotifySession);

/**
 * Rutas existentes de playlists y perfil
 */

/**
 * @route POST /api/spotify/create-from-generated
 * @desc Crea una playlist en Spotify basada en una playlist previamente generada
 * @body { spotifyAccessToken: string, playlistId: string, customTitle?: string, customDescription?: string }
 */
router.post("/create-from-generated", createSpotifyPlaylistFromGenerated);

/**
 * @route POST /api/spotify/create-direct
 * @desc Crea una playlist en Spotify directamente desde una descripción
 * @body { spotifyAccessToken: string, userDescription: string, language?: string, playlistTitle?: string, playlistDescription?: string, useAudioFeatures?: boolean }
 */
router.post("/create-direct", createSpotifyPlaylistDirect);

/**
 * @route POST /api/spotify/profile
 * @desc Obtiene el perfil del usuario de Spotify
 * @body { spotifyAccessToken: string }
 */
router.post("/profile", getSpotifyProfile);

export default router; 