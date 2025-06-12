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

/**
 * Controladores para autenticación OAuth PKCE de Spotify
 */

// Cache temporal para almacenar code verifiers y datos de usuario
const tempCodeVerifiers = new Map();
const tempUserSessions = new Map(); // Para almacenar sesiones temporalmente

/**
 * Endpoint para verificar si un token es válido
 */
export async function verifySpotifyToken(req, res) {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        status: RESPONSE_STATUS.ERROR,
        message: "Access token es requerido"
      });
    }

    // Intentar obtener el perfil para verificar si el token es válido
    const userProfile = await getSpotifyUserProfile(accessToken);
    
    res.json({
      status: RESPONSE_STATUS.SUCCESS,
      data: {
        isValid: true,
        user: {
          id: userProfile.id,
          displayName: userProfile.display_name,
          email: userProfile.email,
          country: userProfile.country,
          followers: userProfile.followers?.total || 0,
          images: userProfile.images || []
        }
      }
    });

  } catch (error) {
    console.error("Error verifying Spotify token:", error);
    
    if (error.message.includes("invalid") || error.message.includes("expired")) {
      return res.json({
        status: RESPONSE_STATUS.SUCCESS,
        data: {
          isValid: false,
          reason: "Token expired or invalid"
        }
      });
    }

    res.status(500).json({
      status: RESPONSE_STATUS.ERROR,
      message: "Error al verificar el token de Spotify",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

/**
 * Endpoint para iniciar el flujo de autenticación OAuth
 */
export async function initSpotifyAuth(req, res) {
  try {
    const { redirectUri } = req.body;

    if (!redirectUri) {
      return res.status(400).json({
        status: RESPONSE_STATUS.ERROR,
        message: "redirectUri es requerido"
      });
    }

    const { generateSpotifyAuthUrl } = await import("../services/spotifyService.js");
    
    // Generar estado único para protección CSRF
    const { randomBytes } = await import('crypto');
    const state = randomBytes(32).toString('hex');
    
    const authData = await generateSpotifyAuthUrl(redirectUri, state);
    
    // Almacenar temporalmente el code verifier asociado con el state
    tempCodeVerifiers.set(state, {
      codeVerifier: authData.codeVerifier,
      timestamp: Date.now(),
      redirectUri
    });

    // Limpiar verifiers antiguos (más de 10 minutos)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [key, value] of tempCodeVerifiers.entries()) {
      if (value.timestamp < tenMinutesAgo) {
        tempCodeVerifiers.delete(key);
      }
    }

    res.json({
      status: RESPONSE_STATUS.SUCCESS,
      data: {
        authUrl: authData.authUrl,
        state: authData.state
      }
    });

  } catch (error) {
    console.error("Error in initSpotifyAuth controller:", error);
    res.status(500).json({
      status: RESPONSE_STATUS.ERROR,
      message: "Error al inicializar la autenticación de Spotify",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

/**
 * Endpoint para manejar el callback de OAuth y intercambiar código por token
 */
export async function handleSpotifyCallback(req, res) {
  try {
    const { code, state } = req.body;

    if (!code || !state) {
      return res.status(400).json({
        status: RESPONSE_STATUS.ERROR,
        message: "Código y estado son requeridos"
      });
    }

    // Recuperar el code verifier almacenado
    const storedData = tempCodeVerifiers.get(state);
    
    if (!storedData) {
      return res.status(400).json({
        status: RESPONSE_STATUS.ERROR,
        message: "Estado inválido o expirado"
      });
    }

    // Limpiar el verifier usado
    tempCodeVerifiers.delete(state);

    const { exchangeCodeForToken, getSpotifyUserProfile } = await import("../services/spotifyService.js");
    
    // Intercambiar código por token
    const tokenData = await exchangeCodeForToken(
      code, 
      storedData.codeVerifier, 
      storedData.redirectUri
    );

    // Obtener perfil del usuario
    const userProfile = await getSpotifyUserProfile(tokenData.access_token);

    // Generar ID de sesión único para almacenar temporalmente los datos
    const { randomBytes } = await import('crypto');
    const sessionId = randomBytes(16).toString('hex');
    
    // Almacenar datos de sesión temporalmente (1 hora)
    tempUserSessions.set(sessionId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      user: {
        id: userProfile.id,
        displayName: userProfile.display_name,
        email: userProfile.email,
        country: userProfile.country,
        followers: userProfile.followers?.total || 0,
        images: userProfile.images || []
      },
      timestamp: Date.now()
    });

    // Limpiar sesiones antiguas (más de 1 hora)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [key, value] of tempUserSessions.entries()) {
      if (value.timestamp < oneHourAgo) {
        tempUserSessions.delete(key);
      }
    }

    res.json({
      status: RESPONSE_STATUS.SUCCESS,
      data: {
        sessionId,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        tokenType: tokenData.token_type,
        scope: tokenData.scope,
        user: {
          id: userProfile.id,
          displayName: userProfile.display_name,
          email: userProfile.email,
          country: userProfile.country,
          followers: userProfile.followers?.total || 0,
          images: userProfile.images || []
        }
      }
    });

  } catch (error) {
    console.error("Error in handleSpotifyCallback controller:", error);
    
    if (error.message.includes("authorization_code") || error.message.includes("invalid")) {
      return res.status(401).json({
        status: RESPONSE_STATUS.ERROR,
        message: "Código de autorización inválido o expirado"
      });
    }

    res.status(500).json({
      status: RESPONSE_STATUS.ERROR,
      message: "Error al procesar la autenticación de Spotify",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

/**
 * Endpoint para refrescar un token de acceso
 */
export async function refreshSpotifyAccessToken(req, res) {
  try {
    const { refreshToken, sessionId } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        status: RESPONSE_STATUS.ERROR,
        message: "Refresh token es requerido"
      });
    }

    const { refreshSpotifyToken } = await import("../services/spotifyService.js");
    
    const tokenData = await refreshSpotifyToken(refreshToken);

    // Si hay sessionId, actualizar los datos almacenados
    if (sessionId && tempUserSessions.has(sessionId)) {
      const sessionData = tempUserSessions.get(sessionId);
      sessionData.accessToken = tokenData.access_token;
      sessionData.expiresAt = Date.now() + (tokenData.expires_in * 1000);
      sessionData.timestamp = Date.now();
      
      if (tokenData.refresh_token) {
        sessionData.refreshToken = tokenData.refresh_token;
      }
      
      tempUserSessions.set(sessionId, sessionData);
    }

    res.json({
      status: RESPONSE_STATUS.SUCCESS,
      data: {
        accessToken: tokenData.access_token,
        expiresIn: tokenData.expires_in,
        tokenType: tokenData.token_type,
        scope: tokenData.scope,
        // Algunos refresh pueden devolver un nuevo refresh token
        ...(tokenData.refresh_token && { refreshToken: tokenData.refresh_token })
      }
    });

  } catch (error) {
    console.error("Error in refreshSpotifyAccessToken controller:", error);
    
    if (error.message.includes("refresh_token") || error.message.includes("invalid")) {
      return res.status(401).json({
        status: RESPONSE_STATUS.ERROR,
        message: "Refresh token inválido o expirado"
      });
    }

    res.status(500).json({
      status: RESPONSE_STATUS.ERROR,
      message: "Error al refrescar el token de Spotify",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

/**
 * Endpoint para obtener datos de sesión almacenados
 */
export async function getSpotifySession(req, res) {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        status: RESPONSE_STATUS.ERROR,
        message: "Session ID es requerido"
      });
    }

    const sessionData = tempUserSessions.get(sessionId);
    
    if (!sessionData) {
      return res.status(404).json({
        status: RESPONSE_STATUS.ERROR,
        message: "Sesión no encontrada o expirada"
      });
    }

    // Verificar si el token ha expirado
    if (Date.now() >= sessionData.expiresAt) {
      // Intentar refrescar automáticamente
      if (sessionData.refreshToken) {
        try {
          const { refreshSpotifyToken } = await import("../services/spotifyService.js");
          const tokenData = await refreshSpotifyToken(sessionData.refreshToken);
          
          sessionData.accessToken = tokenData.access_token;
          sessionData.expiresAt = Date.now() + (tokenData.expires_in * 1000);
          sessionData.timestamp = Date.now();
          
          if (tokenData.refresh_token) {
            sessionData.refreshToken = tokenData.refresh_token;
          }
          
          tempUserSessions.set(sessionId, sessionData);
        } catch (refreshError) {
          console.error("Error refreshing token in getSession:", refreshError);
          tempUserSessions.delete(sessionId);
          return res.status(401).json({
            status: RESPONSE_STATUS.ERROR,
            message: "Sesión expirada y no se pudo renovar"
          });
        }
      } else {
        tempUserSessions.delete(sessionId);
        return res.status(401).json({
          status: RESPONSE_STATUS.ERROR,
          message: "Sesión expirada"
        });
      }
    }

    res.json({
      status: RESPONSE_STATUS.SUCCESS,
      data: {
        accessToken: sessionData.accessToken,
        user: sessionData.user,
        expiresAt: sessionData.expiresAt
      }
    });

  } catch (error) {
    console.error("Error in getSpotifySession controller:", error);
    res.status(500).json({
      status: RESPONSE_STATUS.ERROR,
      message: "Error al obtener la sesión de Spotify",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
} 