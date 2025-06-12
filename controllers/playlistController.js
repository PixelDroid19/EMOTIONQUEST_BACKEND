import { generateClassicalPlaylist, generateFallbackClassicalPlaylist } from "../services/aiService.js";
import { youtubeMusicService } from "../services/youtubeMusicService.js";
import { searchMultipleSpotifyTracks } from "../services/spotifyService.js";
import { store } from "../config/database.js";
import { RESPONSE_STATUS, ERROR_MESSAGES, DEFAULT_PLAYLIST_CONFIG } from "../config/constants.js";
import crypto from "crypto";

/**
 * Endpoint principal que todos los usuarios usan para obtener una playlist
 * Flujo: IA → YouTube Music → Respuesta con videoIds para reproducción
 */
export async function getPlaylist(req, res) {
  try {
    const { userDescription, language = DEFAULT_PLAYLIST_CONFIG.DEFAULT_LANGUAGE } = req.body;

    if (!userDescription || userDescription.trim().length === 0) {
      return res.status(400).json({
        status: RESPONSE_STATUS.ERROR,
        message: ERROR_MESSAGES.MISSING_DESCRIPTION
      });
    }

    console.log(`🎵 Processing playlist request: "${userDescription}", Language: ${language}`);

    // 1. Generar ID único para esta playlist
    const playlistId = crypto.randomUUID();

    // 2. La IA genera la lista de canciones, ya ordenada lógicamente
    let playlistData;
    try {
      playlistData = await generateClassicalPlaylist(userDescription.trim(), language);
    } catch (aiError) {
      console.error("AI generation failed, trying fallback:", aiError);
      try {
        playlistData = await generateFallbackClassicalPlaylist(userDescription.trim(), language);
      } catch (fallbackError) {
        console.error("Fallback generation also failed:", fallbackError);
        return res.status(500).json({
          status: RESPONSE_STATUS.ERROR,
          message: ERROR_MESSAGES.AI_GENERATION_FAILED,
          error: fallbackError.message
        });
      }
    }

    // 3. Enriquecer la lista con videoIds de YouTube Music
    console.log(`🔍 Searching ${playlistData.songs.length} songs on YouTube Music...`);
    
    const songsWithVideoIds = await youtubeMusicService.searchMultipleTracks(playlistData.songs);
    
    // Filtrar solo las canciones que se encontraron
    const foundSongs = songsWithVideoIds.filter(song => song.youtubeMusic !== null);
    
    if (foundSongs.length === 0) {
      return res.status(404).json({
        status: RESPONSE_STATUS.ERROR,
        message: ERROR_MESSAGES.YOUTUBE_SEARCH_FAILED,
        details: "No se encontraron canciones en YouTube Music"
      });
    }

    // 4. Formato final para el frontend
    const finalPlaylist = {
      id: playlistId,
      title: playlistData.title,
      description: playlistData.description,
      totalSongs: foundSongs.length,
      originalSongsCount: playlistData.songs.length,
      songs: foundSongs.map(song => ({
        title: song.youtubeMusic.title,
        artist: song.youtubeMusic.artist,
        duration: song.youtubeMusic.duration,
        videoId: song.youtubeMusic.videoId,
        playbackUrl: song.youtubeMusic.playbackUrl,
        thumbnails: song.youtubeMusic.thumbnails,
        originalTitle: song.title,
        originalArtist: song.artist
      })),
      createdAt: new Date().toISOString()
    };

    // 5. Almacenar en cache para futuras referencias
    store.storePlaylist(playlistId, finalPlaylist);

    // 6. Determinar el status de la respuesta
    const responseStatus = foundSongs.length === playlistData.songs.length ? 
      RESPONSE_STATUS.SUCCESS : RESPONSE_STATUS.PARTIAL;

    console.log(`✅ Playlist generated successfully: ${foundSongs.length}/${playlistData.songs.length} songs found`);

    res.json({
      status: responseStatus,
      message: responseStatus === RESPONSE_STATUS.SUCCESS ? 
        "Playlist generada exitosamente" : 
        `Playlist generada parcialmente: ${foundSongs.length} de ${playlistData.songs.length} canciones encontradas`,
      data: finalPlaylist
    });

  } catch (error) {
    console.error("Error in getPlaylist controller:", error);
    res.status(500).json({
      status: RESPONSE_STATUS.ERROR,
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

/**
 * Endpoint para obtener una playlist previamente generada
 */
export async function getPlaylistById(req, res) {
  try {
    const { playlistId } = req.params;

    if (!playlistId) {
      return res.status(400).json({
        status: RESPONSE_STATUS.ERROR,
        message: "ID de playlist requerido"
      });
    }

    const playlist = store.getPlaylist(playlistId);

    if (!playlist) {
      return res.status(404).json({
        status: RESPONSE_STATUS.ERROR,
        message: "Playlist no encontrada o expirada"
      });
    }

    res.json({
      status: RESPONSE_STATUS.SUCCESS,
      message: "Playlist encontrada",
      data: playlist
    });

  } catch (error) {
    console.error("Error in getPlaylistById controller:", error);
    res.status(500).json({
      status: RESPONSE_STATUS.ERROR,
      message: "Error interno del servidor",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

/**
 * Endpoint para validar canciones en Spotify (útil para preparar creación de playlist)
 */
export async function validateSpotifySongs(req, res) {
  try {
    const { songs, spotifyAccessToken } = req.body;

    if (!songs || !Array.isArray(songs) || songs.length === 0) {
      return res.status(400).json({
        status: RESPONSE_STATUS.ERROR,
        message: "Lista de canciones requerida"
      });
    }

    console.log(`🎵 Validating ${songs.length} songs in Spotify...`);

    // Buscar canciones en Spotify
    const spotifyResults = await searchMultipleSpotifyTracks(spotifyAccessToken, songs);
    
    const foundSongs = spotifyResults.filter(song => song.found);
    const notFoundSongs = spotifyResults.filter(song => !song.found);

    console.log(`✅ Spotify validation complete: ${foundSongs.length}/${songs.length} songs found`);

    res.json({
      status: foundSongs.length > 0 ? RESPONSE_STATUS.SUCCESS : RESPONSE_STATUS.ERROR,
      message: `${foundSongs.length} de ${songs.length} canciones encontradas en Spotify`,
      data: {
        found: foundSongs,
        notFound: notFoundSongs,
        totalRequested: songs.length,
        totalFound: foundSongs.length,
        successRate: (foundSongs.length / songs.length * 100).toFixed(1)
      }
    });

  } catch (error) {
    console.error("Error in validateSpotifySongs controller:", error);
    res.status(500).json({
      status: RESPONSE_STATUS.ERROR,
      message: ERROR_MESSAGES.SPOTIFY_SEARCH_FAILED,
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

/**
 * Endpoint para obtener estadísticas del sistema
 */
export async function getSystemStats(req, res) {
  try {
    const ytMusicStats = youtubeMusicService.getStats();
    const cacheStats = store.getStats();

    res.json({
      status: RESPONSE_STATUS.SUCCESS,
      message: "Estadísticas del sistema",
      data: {
        youtubeMusic: ytMusicStats,
        cache: cacheStats,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error("Error in getSystemStats controller:", error);
    res.status(500).json({
      status: RESPONSE_STATUS.ERROR,
      message: "Error obteniendo estadísticas",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
} 