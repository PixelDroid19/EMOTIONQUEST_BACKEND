import { generateClassicalPlaylist, generateFallbackClassicalPlaylist } from "../services/aiService.js";
import { youtubeMusicService } from "../services/youtubeMusicService.js";
import { searchMultipleSpotifyTracks, getSpotifyUserProfile, createSpotifyPlaylist, addTracksToSpotifyPlaylist } from "../services/spotifyService.js";
import { store, database } from "../config/database.js";
import { RESPONSE_STATUS, ERROR_MESSAGES, DEFAULT_PLAYLIST_CONFIG } from "../config/constants.js";
import Playlist from "../models/Playlist.js";
import crypto from "crypto";

/**
 * Endpoint principal para obtener una playlist.
 * Si se provee un token de Spotify, crea la playlist en la cuenta del usuario.
 * Flujo: IA → YouTube Music → (Opcional: Spotify) → Respuesta
 */
export async function getPlaylist(req, res) {
  try {
    const { userDescription, language = DEFAULT_PLAYLIST_CONFIG.DEFAULT_LANGUAGE, spotifyAccessToken } = req.body;

    if (!userDescription || userDescription.trim().length === 0) {
      return res.status(400).json({
        status: RESPONSE_STATUS.ERROR,
        message: ERROR_MESSAGES.MISSING_DESCRIPTION
      });
    }

    console.log(`🎵 Processing playlist request: "${userDescription}", Language: ${language}`);
    if (spotifyAccessToken) {
      console.log("🔒 Spotify token provided, will attempt to create playlist.");
    }

    // 1. Generar ID único para esta playlist
    const playlistId = crypto.randomUUID();

    // 2. La IA genera la lista de canciones
    let playlistData;
    try {
      playlistData = await generateClassicalPlaylist(userDescription.trim(), language);
    } catch (aiError) {
      console.error("AI generation failed, trying fallback:", aiError);
      playlistData = await generateFallbackClassicalPlaylist(userDescription.trim(), language);
    }

    // 3. Enriquecer con videoIds de YouTube Music (flujo principal)
    console.log(`🔍 Searching ${playlistData.songs.length} songs on YouTube Music...`);
    const songsWithVideoIds = await youtubeMusicService.searchMultipleTracks(playlistData.songs);
    const foundYTSongs = songsWithVideoIds.filter(song => song.youtubeMusic !== null);

    if (foundYTSongs.length === 0) {
      return res.status(404).json({
        status: RESPONSE_STATUS.ERROR,
        message: ERROR_MESSAGES.YOUTUBE_SEARCH_FAILED
      });
    }

    // 4. (Opcional) Crear playlist en Spotify si hay token
    let spotifyPlaylistData = null;
    if (spotifyAccessToken) {
      try {
        console.log("🚀 Starting Spotify playlist creation process...");
        // 4.1. Buscar tracks en Spotify
        const spotifyResults = await searchMultipleSpotifyTracks(spotifyAccessToken, playlistData.songs);
        const foundSpotifyTracks = spotifyResults.filter(song => song.found);

        if (foundSpotifyTracks.length > 0) {
          // 4.2. Obtener perfil del usuario
          const userProfile = await getSpotifyUserProfile(spotifyAccessToken);

          // 4.3. Crear la playlist
          const newSpotifyPlaylist = await createSpotifyPlaylist(spotifyAccessToken, userProfile.id, playlistData.title, playlistData.description, true); // Pública

          // 4.4. Añadir tracks a la playlist
          const trackUris = foundSpotifyTracks.map(song => song.uri);
          await addTracksToSpotifyPlaylist(spotifyAccessToken, newSpotifyPlaylist.id, trackUris);

          spotifyPlaylistData = {
            id: newSpotifyPlaylist.id,
            name: newSpotifyPlaylist.name,
            url: newSpotifyPlaylist.external_urls.spotify,
            tracksAdded: foundSpotifyTracks.length,
            totalRequested: playlistData.songs.length,
          };
          console.log(`✅ Spotify playlist created successfully: ${newSpotifyPlaylist.external_urls.spotify}`);
        } else {
          console.warn("⚠️ No songs found on Spotify. Skipping playlist creation.");
        }
      } catch (spotifyError) {
        console.error("❌ Spotify playlist creation failed:", spotifyError.message);
        // No detenemos el flujo, solo logueamos el error. El usuario aún recibirá su playlist de YT Music.
      }
    }

    // 5. Formato final para el frontend
    const finalPlaylist = {
      id: playlistId,
      title: playlistData.title,
      description: playlistData.description,
      totalSongs: foundYTSongs.length,
      originalSongsCount: playlistData.songs.length,
      songs: foundYTSongs.map(song => ({
        title: song.youtubeMusic.title,
        artist: song.youtubeMusic.artist,
        duration: song.youtubeMusic.duration,
        videoId: song.youtubeMusic.videoId,
        playbackUrl: song.youtubeMusic.playbackUrl,
        thumbnails: song.youtubeMusic.thumbnails,
        originalTitle: song.title,
        originalArtist: song.artist
      })),
      createdAt: new Date().toISOString(),
      spotify: spotifyPlaylistData,
    };

    // 6. Almacenar en cache
    store.storePlaylist(playlistId, finalPlaylist);

    // 6.5. Guardar en MongoDB si está disponible
    let savedToDatabase = false;
    if (database.isReady()) {
      try {
        const playlistToSave = new Playlist({
          title: finalPlaylist.title,
          description: finalPlaylist.description,
          emotion: detectEmotion(userDescription), // Función helper para detectar emoción
          language: language,
          songs: finalPlaylist.songs.map(song => ({
            title: song.title,
            artist: song.artist,
            duration: song.duration,
            videoId: song.videoId,
            playbackUrl: song.playbackUrl,
            thumbnails: song.thumbnails,
            originalTitle: song.originalTitle,
            originalArtist: song.originalArtist,
            spotifyUri: null // Se puede actualizar después
          })),
          originalSongsCount: finalPlaylist.originalSongsCount,
          userId: null, // Se asignará cuando el usuario se loguee
          sessionId: req.headers['x-session-id'] || null, // Para usuarios no logueados
          generatedWith: spotifyPlaylistData ? 'spotify_validated' : 'ai_only',
          spotifyPlaylistId: spotifyPlaylistData?.id || null,
          spotifyPlaylistUrl: spotifyPlaylistData?.url || null,
          spotifyCreatedAt: spotifyPlaylistData ? new Date() : null
        });

        await playlistToSave.save();
        savedToDatabase = true;
        
        // Actualizar el ID para que coincida con MongoDB
        finalPlaylist.mongoId = playlistToSave._id.toString();
        
        console.log(`💾 Playlist guardada en MongoDB: ${playlistToSave._id}`);
      } catch (dbError) {
        console.error('Error guardando en MongoDB:', dbError.message);
        // No interrumpir el flujo, solo logguear
      }
    }

    // 7. Determinar status de la respuesta
    const responseStatus = foundYTSongs.length === playlistData.songs.length ? RESPONSE_STATUS.SUCCESS : RESPONSE_STATUS.PARTIAL;

    console.log(`✅ Playlist generated successfully: ${foundYTSongs.length}/${playlistData.songs.length} songs found`);

    res.json({
      status: responseStatus,
      message: responseStatus === RESPONSE_STATUS.SUCCESS ? "Playlist generada exitosamente" : `Playlist generada parcialmente: ${foundYTSongs.length} de ${playlistData.songs.length} canciones encontradas`,
      data: finalPlaylist
    });

  } catch (error) {
    console.error("Error in getPlaylist controller:", error);
    if (!res.headersSent) {
      res.status(500).json({
        status: RESPONSE_STATUS.ERROR,
        message: "Error interno del servidor",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
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

/**
 * Función helper para detectar la emoción basada en la descripción del usuario
 */
function detectEmotion(userDescription) {
  const description = userDescription.toLowerCase();
  
  // Patrones de palabras clave para cada emoción
  const emotionPatterns = {
    angry: ['enojado', 'angry', 'furioso', 'rabia', 'ira', 'molesto', 'agresivo', 'irritado'],
    happy: ['feliz', 'happy', 'alegre', 'contento', 'eufórico', 'celebrar', 'fiesta', 'diversión', 'joy'],
    sleep: ['dormir', 'sleep', 'relajar', 'calma', 'tranquilo', 'descanso', 'paz', 'meditation', 'chill'],
    magic: ['mágico', 'magic', 'místico', 'fantástico', 'épico', 'aventura', 'maravilla', 'encanto'],
    sad: ['triste', 'sad', 'melancólico', 'llorar', 'deprimido', 'nostalgia', 'pena', 'dolor'],
    party: ['fiesta', 'party', 'bailar', 'dance', 'celebración', 'energético', 'activo', 'upbeat']
  };
  
  // Buscar matches en la descripción
  for (const [emotion, keywords] of Object.entries(emotionPatterns)) {
    if (keywords.some(keyword => description.includes(keyword))) {
      return emotion;
    }
  }
  
  // Si no encuentra match, retornar 'other'
  return 'other';
} 