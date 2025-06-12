import express from "express";
import {
  getPlaylist,
  getPlaylistById,
  validateSpotifySongs,
  getSystemStats
} from "../controllers/playlistController.js";
import {
  savePlaylist,
  getUserPlaylists,
  getSessionPlaylists,
  getPlaylistById as getSavedPlaylistById,
  createSpotifyFromSaved,
  deletePlaylist,
  getPlaylistStats
} from "../controllers/savedPlaylistController.js";

const router = express.Router();

/**
 * @route POST /api/playlists/generate
 * @desc Genera una nueva playlist de música clásica basada en YouTube Music
 * @body { userDescription: string, language?: string }
 */
router.post("/generate", getPlaylist);

/**
 * @route GET /api/playlists/:playlistId
 * @desc Obtiene una playlist previamente generada por ID
 * @param playlistId - UUID de la playlist
 */
router.get("/:playlistId", getPlaylistById);

/**
 * @route POST /api/playlists/validate-spotify
 * @desc Valida qué canciones de una lista están disponibles en Spotify
 * @body { songs: Array<{title: string, artist: string}>, spotifyAccessToken?: string }
 */
router.post("/validate-spotify", validateSpotifySongs);

/**
 * @route GET /api/playlists/stats
 * @desc Obtiene estadísticas del sistema
 */
router.get("/system/stats", getSystemStats);

// ===== RUTAS PARA PLAYLISTS GUARDADAS =====

/**
 * @route POST /api/playlists/save
 * @desc Guarda una playlist en MongoDB
 * @body { title: string, description: string, emotion?: string, language?: string, songs: Array, userId?: string, sessionId?: string }
 */
router.post("/save", savePlaylist);

/**
 * @route GET /api/playlists/user/:userId
 * @desc Obtiene playlists de un usuario específico
 * @param userId - ID del usuario de Spotify
 * @query { limit?: number, emotion?: string, page?: number }
 */
router.get("/user/:userId", getUserPlaylists);

/**
 * @route GET /api/playlists/session/:sessionId
 * @desc Obtiene playlists de una sesión específica (usuarios no logueados)
 * @param sessionId - ID de la sesión
 * @query { limit?: number }
 */
router.get("/session/:sessionId", getSessionPlaylists);

/**
 * @route GET /api/playlists/saved/:id
 * @desc Obtiene una playlist guardada específica por ID de MongoDB
 * @param id - ID de MongoDB de la playlist
 */
router.get("/saved/:id", getSavedPlaylistById);

/**
 * @route POST /api/playlists/saved/:id/spotify
 * @desc Crea una playlist en Spotify desde una playlist guardada
 * @param id - ID de MongoDB de la playlist
 * @body { spotifyAccessToken: string, customTitle?: string, customDescription?: string }
 */
router.post("/saved/:id/spotify", createSpotifyFromSaved);

/**
 * @route DELETE /api/playlists/saved/:id
 * @desc Elimina una playlist guardada
 * @param id - ID de MongoDB de la playlist
 * @body { userId?: string }
 */
router.delete("/saved/:id", deletePlaylist);

/**
 * @route GET /api/playlists/stats/saved
 * @desc Obtiene estadísticas de playlists guardadas en MongoDB
 */
router.get("/stats/saved", getPlaylistStats);

export default router; 