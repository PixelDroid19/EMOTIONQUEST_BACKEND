import express from "express";
import {
  getPlaylist,
  getPlaylistById,
  validateSpotifySongs,
  getSystemStats
} from "../controllers/playlistController.js";

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

export default router; 