import { 
  getSpotifyUserProfile, 
  createSpotifyPlaylist, 
  addTracksToSpotifyPlaylist, 
  searchMultipleSpotifyTracks,
  getTracksAudioFeatures,
  extractIdFromUri
} from "../services/spotifyService.js";
import { refinePlaylistWithAudioFeatures } from "../services/aiService.js";
import { store } from "../config/database.js";
import { RESPONSE_STATUS, ERROR_MESSAGES } from "../config/constants.js";

/**
 * Endpoint para crear una playlist en Spotify basada en una playlist generada previamente
 */
export async function createSpotifyPlaylistFromGenerated(req, res) {
  try {
    const { spotifyAccessToken, playlistId, customTitle, customDescription } = req.body;

    if (!spotifyAccessToken) {
      return res.status(400).json({
        status: RESPONSE_STATUS.ERROR,
        message: ERROR_MESSAGES.INVALID_ACCESS_TOKEN
      });
    }

    if (!playlistId) {
      return res.status(400).json({
        status: RESPONSE_STATUS.ERROR,
        message: "ID de playlist requerido"
      });
    }

    // 1. Obtener la playlist generada del cache
    const cachedPlaylist = store.getPlaylist(playlistId);
    if (!cachedPlaylist) {
      return res.status(404).json({
        status: RESPONSE_STATUS.ERROR,
        message: "Playlist no encontrada o expirada"
      });
    }

    console.log(`🎵 Creating Spotify playlist from cached playlist: "${cachedPlaylist.title}"`);

    // 2. Obtener perfil del usuario de Spotify
    const userProfile = await getSpotifyUserProfile(spotifyAccessToken);
    const userId = userProfile.id;

    // 3. Extraer canciones originales para buscar en Spotify
    const originalSongs = cachedPlaylist.songs.map(song => ({
      title: song.originalTitle || song.title,
      artist: song.originalArtist || song.artist
    }));

    // 4. Buscar canciones en Spotify
    console.log(`🔍 Searching ${originalSongs.length} songs in Spotify...`);
    const spotifyResults = await searchMultipleSpotifyTracks(spotifyAccessToken, originalSongs);
    
    const foundSongs = spotifyResults.filter(song => song.found);
    
    if (foundSongs.length === 0) {
      return res.status(404).json({
        status: RESPONSE_STATUS.ERROR,
        message: ERROR_MESSAGES.SPOTIFY_SEARCH_FAILED,
        details: "No se encontraron canciones en Spotify"
      });
    }

    // 5. Crear la playlist en Spotify
    const playlistTitle = customTitle || cachedPlaylist.title;
    const playlistDescription = customDescription || cachedPlaylist.description;
    
    const newPlaylist = await createSpotifyPlaylist(
      spotifyAccessToken,
      userId,
      playlistTitle,
      playlistDescription,
      true // playlist pública
    );

    // 6. Añadir las canciones encontradas a la playlist
    const trackUris = foundSongs.map(song => song.uri);
    
    if (trackUris.length > 0) {
      await addTracksToSpotifyPlaylist(spotifyAccessToken, newPlaylist.id, trackUris);
    }

    console.log(`✅ Spotify playlist created: ${foundSongs.length}/${originalSongs.length} songs added`);

    // 7. Respuesta
    res.json({
      status: RESPONSE_STATUS.SUCCESS,
      message: `Playlist creada exitosamente en Spotify con ${foundSongs.length} canciones`,
      data: {
        spotify: {
          id: newPlaylist.id,
          name: newPlaylist.name,
          description: newPlaylist.description,
          url: newPlaylist.external_urls.spotify,
          tracksAdded: foundSongs.length,
          totalRequested: originalSongs.length
        },
        original: {
          id: cachedPlaylist.id,
          title: cachedPlaylist.title,
          totalSongs: cachedPlaylist.totalSongs
        }
      }
    });

  } catch (error) {
    console.error("Error in createSpotifyPlaylistFromGenerated controller:", error);
    
    if (error.message.includes("invalid") || error.message.includes("expired")) {
      return res.status(401).json({
        status: RESPONSE_STATUS.ERROR,
        message: ERROR_MESSAGES.INVALID_ACCESS_TOKEN
      });
    }

    res.status(500).json({
      status: RESPONSE_STATUS.ERROR,
      message: ERROR_MESSAGES.SPOTIFY_PLAYLIST_CREATION_FAILED,
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

/**
 * Endpoint para crear una playlist en Spotify directamente desde una descripción
 */
export async function createSpotifyPlaylistDirect(req, res) {
  try {
    const { 
      spotifyAccessToken, 
      userDescription, 
      language = "any",
      playlistTitle,
      playlistDescription,
      useAudioFeatures = false 
    } = req.body;

    if (!spotifyAccessToken) {
      return res.status(400).json({
        status: RESPONSE_STATUS.ERROR,
        message: ERROR_MESSAGES.INVALID_ACCESS_TOKEN
      });
    }

    if (!userDescription || userDescription.trim().length === 0) {
      return res.status(400).json({
        status: RESPONSE_STATUS.ERROR,
        message: ERROR_MESSAGES.MISSING_DESCRIPTION
      });
    }

    console.log(`🎵 Creating Spotify playlist directly for: "${userDescription}"`);

    // 1. Obtener perfil del usuario
    const userProfile = await getSpotifyUserProfile(spotifyAccessToken);
    const userId = userProfile.id;

    // 2. Reutilizar la lógica del controlador principal pero con búsqueda de Spotify
    const { generateClassicalPlaylist, generateFallbackClassicalPlaylist } = await import("../services/aiService.js");
    
    let playlistData;
    try {
      playlistData = await generateClassicalPlaylist(userDescription.trim(), language);
    } catch (aiError) {
      console.error("AI generation failed, trying fallback:", aiError);
      playlistData = await generateFallbackClassicalPlaylist(userDescription.trim(), language);
    }

    // 3. Buscar canciones en Spotify
    console.log(`🔍 Searching ${playlistData.songs.length} songs in Spotify...`);
    const spotifyResults = await searchMultipleSpotifyTracks(spotifyAccessToken, playlistData.songs);
    
    let foundSongs = spotifyResults.filter(song => song.found);
    
    if (foundSongs.length < 5) {
      return res.status(404).json({
        status: RESPONSE_STATUS.ERROR,
        message: ERROR_MESSAGES.INSUFFICIENT_SONGS,
        details: `Solo se encontraron ${foundSongs.length} canciones en Spotify`
      });
    }

    // 4. Refinar con audio features si se solicita
    if (useAudioFeatures && foundSongs.length > 0) {
      console.log("🎯 Refining playlist with audio features...");
      
      // Obtener IDs de tracks
      const trackIds = foundSongs.map(song => extractIdFromUri(song.uri)).filter(Boolean);
      
      if (trackIds.length > 0) {
        // Obtener características de audio
        const audioFeatures = await getTracksAudioFeatures(spotifyAccessToken, trackIds);
        
        // Combinar canciones con sus características
        const songsWithFeatures = foundSongs.map((song, index) => ({
          ...song,
          id: trackIds[index],
          audioFeatures: audioFeatures[index]
        }));

        // Refinar con IA
        try {
          const refinedSongs = await refinePlaylistWithAudioFeatures(userDescription, songsWithFeatures);
          foundSongs = refinedSongs;
          console.log("✅ Playlist refined with audio features");
        } catch (refineError) {
          console.warn("Audio features refinement failed, using original order:", refineError);
        }
      }
    }

    // 5. Crear la playlist en Spotify
    const finalTitle = playlistTitle || playlistData.title;
    const finalDescription = playlistDescription || playlistData.description;
    
    const newPlaylist = await createSpotifyPlaylist(
      spotifyAccessToken,
      userId,
      finalTitle,
      finalDescription,
      true
    );

    // 6. Añadir canciones a la playlist
    const trackUris = foundSongs.map(song => song.uri);
    
    if (trackUris.length > 0) {
      await addTracksToSpotifyPlaylist(spotifyAccessToken, newPlaylist.id, trackUris);
    }

    console.log(`✅ Direct Spotify playlist created: ${foundSongs.length} songs added`);

    // 7. Respuesta
    res.json({
      status: RESPONSE_STATUS.SUCCESS,
      message: `Playlist creada exitosamente en Spotify con ${foundSongs.length} canciones`,
      data: {
        playlist: {
          id: newPlaylist.id,
          name: newPlaylist.name,
          description: newPlaylist.description,
          url: newPlaylist.external_urls.spotify,
          totalTracks: foundSongs.length,
          audioFeaturesUsed: useAudioFeatures,
          tracks: foundSongs.map(song => ({
            title: song.title,
            artist: song.artist,
            uri: song.uri
          }))
        },
        generation: {
          originalRequest: userDescription,
          language: language,
          totalGenerated: playlistData.songs.length,
          totalFound: foundSongs.length,
          successRate: (foundSongs.length / playlistData.songs.length * 100).toFixed(1)
        }
      }
    });

  } catch (error) {
    console.error("Error in createSpotifyPlaylistDirect controller:", error);
    
    if (error.message.includes("invalid") || error.message.includes("expired")) {
      return res.status(401).json({
        status: RESPONSE_STATUS.ERROR,
        message: ERROR_MESSAGES.INVALID_ACCESS_TOKEN
      });
    }

    res.status(500).json({
      status: RESPONSE_STATUS.ERROR,
      message: ERROR_MESSAGES.SPOTIFY_PLAYLIST_CREATION_FAILED,
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

/**
 * Endpoint para verificar el perfil del usuario de Spotify
 */
export async function getSpotifyProfile(req, res) {
  try {
    const { spotifyAccessToken } = req.body;

    if (!spotifyAccessToken) {
      return res.status(400).json({
        status: RESPONSE_STATUS.ERROR,
        message: ERROR_MESSAGES.INVALID_ACCESS_TOKEN
      });
    }

    const userProfile = await getSpotifyUserProfile(spotifyAccessToken);

    res.json({
      status: RESPONSE_STATUS.SUCCESS,
      message: "Perfil de Spotify obtenido exitosamente",
      data: {
        id: userProfile.id,
        displayName: userProfile.display_name,
        email: userProfile.email,
        country: userProfile.country,
        followers: userProfile.followers?.total || 0,
        images: userProfile.images || [],
        product: userProfile.product,
        externalUrls: userProfile.external_urls
      }
    });

  } catch (error) {
    console.error("Error in getSpotifyProfile controller:", error);
    
    if (error.message.includes("invalid") || error.message.includes("expired")) {
      return res.status(401).json({
        status: RESPONSE_STATUS.ERROR,
        message: ERROR_MESSAGES.INVALID_ACCESS_TOKEN
      });
    }

    res.status(500).json({
      status: RESPONSE_STATUS.ERROR,
      message: "Error obteniendo perfil de Spotify",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
} 