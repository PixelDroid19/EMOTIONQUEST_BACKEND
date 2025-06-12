import axios from "axios";
import { SPOTIFY_API_BASE_URL } from "../config/constants.js";

// Variable para almacenar el token de cliente y su tiempo de expiración
let clientCredentialsToken = null;
let tokenExpirationTime = null;

export function extractIdFromUri(uri = "") {
  const match = uri.match(/spotify:track:([^:]+)/);
  return match ? match[1] : null;
}

export async function getSpotifyUserProfile(accessToken = "") {
  try {
    const response = await axios.get(`${SPOTIFY_API_BASE_URL}/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching Spotify user profile:", error);
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      throw new Error("Spotify token is invalid or expired. Please log in again.");
    }
    throw new Error("Failed to fetch Spotify user profile.");
  }
}

// Función para obtener un token de acceso usando Client Credentials Flow
export const getClientCredentialsToken = async () => {
  try {
    // Verificar si ya tenemos un token válido
    const now = Date.now();
    if (clientCredentialsToken && tokenExpirationTime && now < tokenExpirationTime) {
      return clientCredentialsToken;
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables are required");
    }

    // Si no hay token o expiró, obtenemos uno nuevo
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await axios.post("https://accounts.spotify.com/api/token", 
      new URLSearchParams({
        grant_type: "client_credentials",
      }),
      {
        headers: {
          Authorization: `Basic ${authString}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const data = response.data;

    // Guardar el token y calcular tiempo de expiración (expira_in viene en segundos)
    clientCredentialsToken = data.access_token;
    // Agregar un margen de seguridad de 60 segundos antes de la expiración
    tokenExpirationTime = now + (data.expires_in - 60) * 1000;

    console.log("✅ Spotify client credentials token obtained");
    return clientCredentialsToken;
  } catch (error) {
    console.error("Error obteniendo token de cliente:", error);
    throw new Error(`Failed to get Spotify client credentials: ${error.message}`);
  }
};

// Función para crear una playlist en Spotify (requiere token de usuario)
export const createSpotifyPlaylist = async (accessToken, userId, name, description, isPublic = true) => {
  try {
    const response = await axios.post(
      `${SPOTIFY_API_BASE_URL}/users/${userId}/playlists`,
      {
        name: name,
        description: description,
        public: isPublic,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error("Error creando playlist:", error);
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      throw new Error("Spotify token is invalid or expired. Please log in again.");
    }
    throw new Error(`Failed to create Spotify playlist: ${error.message}`);
  }
};

export async function searchSpotifyTrack(accessToken, track = {}) {
  const { title, artist } = track;
  if (!title) {
    console.warn("Cannot search track without title");
    return null;
  }

  try {
    // Si no hay accessToken, usamos el token de cliente
    let tokenToUse = accessToken;
    if (!tokenToUse) {
      try {
        tokenToUse = await getClientCredentialsToken();
      } catch (err) {
        console.error("Error obteniendo token de cliente para búsqueda:", err);
        return null;
      }
    }

    const searchQuery = `${title.trim()} ${artist ? artist.trim() : ""}`.trim();
    const encodedQuery = encodeURIComponent(searchQuery);

    const response = await axios.get(
      `${SPOTIFY_API_BASE_URL}/search?q=${encodedQuery}&type=track&limit=5`,
      {
        headers: {
          Authorization: `Bearer ${tokenToUse}`,
        },
      }
    );

    const { tracks } = response.data;
    if (tracks && tracks.items.length > 0) {
      // Buscar el mejor match basado en similitud de título y artista
      const bestMatch = findBestSpotifyMatch(tracks.items, title, artist);
      return bestMatch ? bestMatch.uri : null;
    }
    return null;
  } catch (error) {
    console.error("Error searching Spotify track:", error);
    return null;
  }
}

function findBestSpotifyMatch(results, originalTitle, originalArtist) {
  if (!results || results.length === 0) return null;
  if (results.length === 1) return results[0];

  // Función para calcular similitud de texto
  const similarity = (str1, str2) => {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 1;
    
    // Similitud basada en palabras comunes
    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);
    const commonWords = words1.filter(word => words2.includes(word));
    
    return commonWords.length / Math.max(words1.length, words2.length);
  };

  // Calcular puntuación para cada resultado
  const scoredResults = results.map(result => {
    let score = 0;
    
    // Puntuación por similitud de título
    const titleSimilarity = similarity(result.name, originalTitle);
    score += titleSimilarity * 0.7; // 70% peso al título
    
    // Puntuación por similitud de artista
    if (originalArtist && result.artists?.[0]?.name) {
      const artistSimilarity = similarity(result.artists[0].name, originalArtist);
      score += artistSimilarity * 0.3; // 30% peso al artista
    }

    // Bonificación si tiene alta popularidad
    if (result.popularity && result.popularity > 50) {
      score += 0.1;
    }

    return { result, score };
  });

  // Ordenar por puntuación y retornar el mejor
  scoredResults.sort((a, b) => b.score - a.score);
  return scoredResults[0].result;
}

export async function getTracksAudioFeatures(accessToken, trackIds) {
  if (!trackIds || trackIds.length === 0) {
    return [];
  }

  try {
    // Si no hay accessToken, usamos el token de cliente
    let tokenToUse = accessToken;
    if (!tokenToUse) {
      try {
        tokenToUse = await getClientCredentialsToken();
      } catch (err) {
        console.error("Error obteniendo token de cliente para audio features:", err);
        return [];
      }
    }

    // Para peticiones de hasta 100 IDs de tracks a la vez
    const response = await axios.get(`${SPOTIFY_API_BASE_URL}/audio-features`, {
      params: {
        ids: trackIds.join(","),
      },
      headers: {
        Authorization: `Bearer ${tokenToUse}`,
      },
    });

    return response.data.audio_features || [];
  } catch (error) {
    console.error("Error fetching audio features:", error);
    return [];
  }
}

export async function addTracksToSpotifyPlaylist(accessToken = "", playlistId = "", trackUris) {
  if (trackUris.length === 0) {
    console.log("No track URIs to add to playlist.");
    return null;
  }
  
  const uniqueTrackUris = Array.from(new Set(trackUris));
  if (uniqueTrackUris.length > 100) {
    console.warn("Cannot add more than 100 tracks at a time to a playlist. Adding the first 100.");
    uniqueTrackUris.splice(100);
  }

  try {
    const response = await axios.post(
      `${SPOTIFY_API_BASE_URL}/playlists/${playlistId}/tracks`,
      {
        uris: uniqueTrackUris,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error adding tracks to Spotify playlist:", error);
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      throw new Error("Spotify token is invalid or expired. Please log in again.");
    }
    throw new Error("Failed to add tracks to Spotify playlist.");
  }
}

// Función para procesar múltiples tracks en lotes
export async function searchMultipleSpotifyTracks(accessToken, songs) {
  const results = [];
  const batchSize = 5; // Procesar en lotes para no sobrecargar la API
  
  for (let i = 0; i < songs.length; i += batchSize) {
    const batch = songs.slice(i, i + batchSize);
    
    // Procesar lote actual
    const batchPromises = batch.map(async (song) => {
      try {
        const uri = await searchSpotifyTrack(accessToken, song);
        return {
          ...song,
          uri,
          found: !!uri
        };
      } catch (error) {
        console.error(`Error searching for "${song.title}":`, error);
        return {
          ...song,
          uri: null,
          found: false
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Pequeña pausa entre lotes para ser respetuosos con la API
    if (i + batchSize < songs.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return results;
}

/**
 * Funciones para manejar autenticación OAuth PKCE de Spotify
 */

// Generar string aleatorio para code verifier
async function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = new Uint8Array(length);
  
  // En Node.js usamos crypto nativo
  const { randomFillSync } = await import('crypto');
  randomFillSync(values);
  
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

// Generar code challenge desde code verifier
async function generateCodeChallenge(codeVerifier) {
  const { createHash } = await import('crypto');
  const data = new TextEncoder().encode(codeVerifier);
  const digest = createHash('sha256').update(data).digest();
  
  return digest.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Generar URL de autorización para Spotify
export async function generateSpotifyAuthUrl(redirectUri, state) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  
  if (!clientId) {
    throw new Error("SPOTIFY_CLIENT_ID environment variable is required");
  }

  // Generar code verifier y challenge
  const codeVerifier = await generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  
  // Scopes que necesitamos
  const scope = 'user-read-private user-read-email playlist-modify-public playlist-modify-private';
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope,
    redirect_uri: redirectUri,
    state,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
  
  return {
    authUrl,
    codeVerifier, // Esto debe ser almacenado temporalmente para el callback
    state
  };
}

// Intercambiar código de autorización por access token
export async function exchangeCodeForToken(code, codeVerifier, redirectUri) {
  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    
    if (!clientId) {
      throw new Error("SPOTIFY_CLIENT_ID environment variable is required");
    }

    const response = await axios.post('https://accounts.spotify.com/api/token', 
      new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error exchanging code for token:', error);
    throw new Error(`Failed to exchange authorization code: ${error.message}`);
  }
}

// Refrescar access token usando refresh token
export async function refreshSpotifyToken(refreshToken) {
  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    
    if (!clientId) {
      throw new Error("SPOTIFY_CLIENT_ID environment variable is required");
    }

    const response = await axios.post('https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error refreshing token:', error);
    throw new Error(`Failed to refresh token: ${error.message}`);
  }
} 