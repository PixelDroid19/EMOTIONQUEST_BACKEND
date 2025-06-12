/**
 * Sistema de almacenamiento en memoria para el cache de playlists
 * En producción, esto debería ser reemplazado por una base de datos real
 */

class InMemoryStore {
  constructor() {
    this.playlists = new Map();
    this.searchCache = new Map();
    this.maxCacheSize = 1000;
    this.cacheExpiry = 30 * 60 * 1000; // 30 minutos
  }

  // Cache de playlists generadas
  storePlaylist(id, playlistData) {
    this.playlists.set(id, {
      ...playlistData,
      createdAt: Date.now(),
      id
    });
    
    // Limpiar cache si es muy grande
    if (this.playlists.size > this.maxCacheSize) {
      const oldestKey = this.playlists.keys().next().value;
      this.playlists.delete(oldestKey);
    }
  }

  getPlaylist(id) {
    const playlist = this.playlists.get(id);
    if (!playlist) return null;

    // Verificar si no ha expirado
    if (Date.now() - playlist.createdAt > this.cacheExpiry) {
      this.playlists.delete(id);
      return null;
    }

    return playlist;
  }

  // Cache de búsquedas de YouTube Music
  storeSearchResult(query, result) {
    const key = this.normalizeQuery(query);
    this.searchCache.set(key, {
      result,
      timestamp: Date.now()
    });

    // Limpiar cache si es muy grande
    if (this.searchCache.size > this.maxCacheSize) {
      const oldestKey = this.searchCache.keys().next().value;
      this.searchCache.delete(oldestKey);
    }
  }

  getSearchResult(query) {
    const key = this.normalizeQuery(query);
    const cached = this.searchCache.get(key);
    
    if (!cached) return null;

    // Cache de búsquedas expira más rápido (10 minutos)
    if (Date.now() - cached.timestamp > 10 * 60 * 1000) {
      this.searchCache.delete(key);
      return null;
    }

    return cached.result;
  }

  normalizeQuery(query) {
    return query.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  // Limpiar cache expirado
  cleanup() {
    const now = Date.now();
    
    // Limpiar playlists expiradas
    for (const [key, value] of this.playlists.entries()) {
      if (now - value.createdAt > this.cacheExpiry) {
        this.playlists.delete(key);
      }
    }

    // Limpiar búsquedas expiradas
    for (const [key, value] of this.searchCache.entries()) {
      if (now - value.timestamp > 10 * 60 * 1000) {
        this.searchCache.delete(key);
      }
    }
  }

  // Estadísticas del cache
  getStats() {
    return {
      playlistsCount: this.playlists.size,
      searchCacheCount: this.searchCache.size,
      maxCacheSize: this.maxCacheSize
    };
  }
}

// Singleton instance
export const store = new InMemoryStore();

// Ejecutar limpieza cada 5 minutos
setInterval(() => {
  store.cleanup();
}, 5 * 60 * 1000); 