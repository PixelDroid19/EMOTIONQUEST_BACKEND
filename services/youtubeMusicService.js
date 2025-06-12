import YTMusic from "ytmusic-api";
import { store } from "../config/database.js";

class YouTubeMusicService {
  constructor() {
    this.ytmusic = null;
    this.initialized = false;
    this.initializationPromise = null;
  }

  async initialize() {
    if (this.initialized) return;
    
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._doInitialize();
    return this.initializationPromise;
  }

  async _doInitialize() {
    try {
      this.ytmusic = new YTMusic();
      await this.ytmusic.initialize();
      this.initialized = true;
      console.log("✅ YouTube Music service initialized successfully");
    } catch (error) {
      console.error("❌ Error initializing YouTube Music service:", error);
      throw new Error(`Failed to initialize YouTube Music service: ${error.message}`);
    }
  }

  async searchTrack(title, artist) {
    await this.initialize();
    
    if (!title) {
      console.warn("Cannot search track without title");
      return null;
    }

    // Crear query de búsqueda
    const query = `${title.trim()} ${artist ? artist.trim() : ""}`.trim();
    
    // Verificar cache primero
    const cachedResult = store.getSearchResult(query);
    if (cachedResult) {
      console.log(`📦 Cache hit for: "${query}"`);
      return cachedResult;
    }

    try {
      console.log(`🔍 Searching YouTube Music for: "${query}"`);
      
      // Búsqueda específica para música
      const searchResults = await this.ytmusic.searchSongs(query, {
        limit: 5 // Obtener varios resultados para mejor matching
      });

      if (!searchResults || searchResults.length === 0) {
        console.log(`❌ No results found for: "${query}"`);
        store.storeSearchResult(query, null);
        return null;
      }

      // Buscar el mejor match
      const bestMatch = this.findBestMatch(searchResults, title, artist);
      
      if (bestMatch) {
        const result = {
          videoId: bestMatch.videoId,
          title: bestMatch.name,
          artist: bestMatch.artist?.name || bestMatch.artists?.[0]?.name || "Unknown Artist",
          duration: bestMatch.duration,
          thumbnails: bestMatch.thumbnails,
          playbackUrl: `https://www.youtube.com/watch?v=${bestMatch.videoId}`
        };

        console.log(`✅ Found match: "${result.title}" by ${result.artist}`);
        
        // Almacenar en cache
        store.storeSearchResult(query, result);
        return result;
      } else {
        console.log(`❌ No suitable match found for: "${query}"`);
        store.storeSearchResult(query, null);
        return null;
      }

    } catch (error) {
      console.error(`❌ Error searching YouTube Music for "${query}":`, error);
      return null;
    }
  }

  findBestMatch(results, originalTitle, originalArtist) {
    if (!results || results.length === 0) return null;

    // Si solo hay un resultado, retornarlo
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
      if (originalArtist && result.artist?.name) {
        const artistSimilarity = similarity(result.artist.name, originalArtist);
        score += artistSimilarity * 0.3; // 30% peso al artista
      } else if (originalArtist && result.artists?.[0]?.name) {
        const artistSimilarity = similarity(result.artists[0].name, originalArtist);
        score += artistSimilarity * 0.3;
      }

      // Penalizar si es muy corto (probablemente no es la versión completa)
      if (result.duration && result.duration.seconds < 60) {
        score *= 0.8;
      }

      return { result, score };
    });

    // Ordenar por puntuación y retornar el mejor
    scoredResults.sort((a, b) => b.score - a.score);
    
    console.log(`🎯 Best match score: ${scoredResults[0].score.toFixed(2)} for "${scoredResults[0].result.name}"`);
    
    return scoredResults[0].result;
  }

  async searchMultipleTracks(songs) {
    await this.initialize();
    
    const results = [];
    const batchSize = 3; // Procesar en lotes para no sobrecargar la API
    
    for (let i = 0; i < songs.length; i += batchSize) {
      const batch = songs.slice(i, i + batchSize);
      
      // Procesar lote actual
      const batchPromises = batch.map(async (song) => {
        try {
          const result = await this.searchTrack(song.title, song.artist);
          return {
            ...song,
            youtubeMusic: result
          };
        } catch (error) {
          console.error(`Error searching for "${song.title}":`, error);
          return {
            ...song,
            youtubeMusic: null
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Pequeña pausa entre lotes para ser respetuosos con la API
      if (i + batchSize < songs.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return results;
  }

  async getPlaylist(playlistId) {
    await this.initialize();
    
    try {
      const playlist = await this.ytmusic.getPlaylist(playlistId);
      return playlist;
    } catch (error) {
      console.error(`Error fetching YouTube Music playlist ${playlistId}:`, error);
      throw new Error(`Failed to fetch playlist: ${error.message}`);
    }
  }

  async getArtist(artistId) {
    await this.initialize();
    
    try {
      const artist = await this.ytmusic.getArtist(artistId);
      return artist;
    } catch (error) {
      console.error(`Error fetching YouTube Music artist ${artistId}:`, error);
      throw new Error(`Failed to fetch artist: ${error.message}`);
    }
  }

  async getSong(videoId) {
    await this.initialize();
    
    try {
      const song = await this.ytmusic.getSong(videoId);
      return song;
    } catch (error) {
      console.error(`Error fetching YouTube Music song ${videoId}:`, error);
      throw new Error(`Failed to fetch song: ${error.message}`);
    }
  }

  // Método para obtener estadísticas del servicio
  getStats() {
    return {
      initialized: this.initialized,
      cacheStats: store.getStats()
    };
  }
}

// Singleton instance
export const youtubeMusicService = new YouTubeMusicService(); 