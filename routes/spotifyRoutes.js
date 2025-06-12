import express from "express";
import {
  createSpotifyPlaylistFromGenerated,
  createSpotifyPlaylistDirect,
  getSpotifyProfile
} from "../controllers/spotifyController.js";

const router = express.Router();

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