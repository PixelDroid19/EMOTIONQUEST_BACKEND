/**
 * Sistema de almacenamiento en memoria para el cache de playlists
 * En producción, esto debería ser reemplazado por una base de datos real
 */

import mongoose from 'mongoose';

// Store para caché de playlists y búsquedas de YouTube Music en memoria
class PlaylistStore {
  constructor() {
    this.playlists = new Map();
    this.searchResults = new Map(); // Cache para búsquedas de YouTube Music
    this.EXPIRATION_TIME = 24 * 60 * 60 * 1000; // 24 horas
    this.SEARCH_EXPIRATION_TIME = 4 * 60 * 60 * 1000; // 4 horas para búsquedas
  }

  generateId() {
    return `playlist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  storePlaylist(playlistData) {
    const id = this.generateId();
    const playlist = {
      id,
      ...playlistData,
      timestamp: Date.now()
    };
    
    this.playlists.set(id, playlist);
    console.log(`📀 Playlist cached with ID: ${id}`);
    
    // Limpiar playlists expiradas
    this.cleanExpiredPlaylists();
    
    return playlist;
  }

  getPlaylist(id) {
    const playlist = this.playlists.get(id);
    if (!playlist) return null;
    
    // Verificar si ha expirado
    if (Date.now() - playlist.timestamp > this.EXPIRATION_TIME) {
      this.playlists.delete(id);
      return null;
    }
    
    return playlist;
  }

  cleanExpiredPlaylists() {
    const now = Date.now();
    for (const [id, playlist] of this.playlists.entries()) {
      if (now - playlist.timestamp > this.EXPIRATION_TIME) {
        this.playlists.delete(id);
      }
    }
  }

  getAllPlaylists() {
    this.cleanExpiredPlaylists();
    return Array.from(this.playlists.values());
  }

  getStats() {
    this.cleanExpiredPlaylists();
    this.cleanExpiredSearchResults();
    return {
      totalPlaylists: this.playlists.size,
      totalSearchResults: this.searchResults.size,
      oldestPlaylist: this.playlists.size > 0 ? 
        Math.min(...Array.from(this.playlists.values()).map(p => p.timestamp)) : null,
      oldestSearchResult: this.searchResults.size > 0 ?
        Math.min(...Array.from(this.searchResults.values()).map(r => r.timestamp)) : null
    };
  }

  // Métodos para caché de búsquedas de YouTube Music
  storeSearchResult(query, result) {
    const searchEntry = {
      query,
      result,
      timestamp: Date.now()
    };
    
    this.searchResults.set(query, searchEntry);
    console.log(`🔍 Search result cached for: "${query}"`);
    
    // Limpiar búsquedas expiradas
    this.cleanExpiredSearchResults();
  }

  getSearchResult(query) {
    const searchEntry = this.searchResults.get(query);
    if (!searchEntry) return null;
    
    // Verificar si ha expirado
    if (Date.now() - searchEntry.timestamp > this.SEARCH_EXPIRATION_TIME) {
      this.searchResults.delete(query);
      return null;
    }
    
    return searchEntry.result;
  }

  cleanExpiredSearchResults() {
    const now = Date.now();
    for (const [query, searchEntry] of this.searchResults.entries()) {
      if (now - searchEntry.timestamp > this.SEARCH_EXPIRATION_TIME) {
        this.searchResults.delete(query);
      }
    }
  }

  // Limpiar todos los caches
  clearAllCaches() {
    this.playlists.clear();
    this.searchResults.clear();
    console.log('🧹 Todos los caches limpiados');
  }
}

// Configuración de MongoDB
class DatabaseConnection {
  constructor() {
    this.isConnected = false;
  }

  async connect() {
    try {
      if (this.isConnected) {
        console.log('📦 MongoDB ya está conectado');
        return;
      }

      const mongoUri = process.env.MONGODB_URI;
      if (!mongoUri) {
        console.warn('⚠️ MONGODB_URI no está configurado. Funcionando solo con caché en memoria.');
        return;
      }

      console.log('🔗 Conectando a MongoDB...');
      console.log(`📍 URI: ${mongoUri.replace(/:[^:@]*@/, ':***@')}`); // Ocultar password en logs

      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000, // 5 segundos
        maxPoolSize: 10,
        retryWrites: true,
        w: 'majority',
        dbName: 'emotionquest' // Especificar explícitamente el nombre de la base de datos
      });

      this.isConnected = true;
      console.log('🎯 MongoDB conectado exitosamente');
      console.log(`🏛️ Base de datos activa: ${mongoose.connection.db.databaseName}`);
      console.log(`🌐 Host: ${mongoose.connection.host}:${mongoose.connection.port}`);

      // Eventos de conexión
      mongoose.connection.on('error', (error) => {
        console.error('❌ Error de MongoDB:', error);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('⚠️ MongoDB desconectado');
        this.isConnected = false;
      });

      mongoose.connection.on('reconnected', () => {
        console.log('🔄 MongoDB reconectado');
        this.isConnected = true;
      });

    } catch (error) {
      console.error('❌ Error conectando a MongoDB:', error.message);
      console.log('📦 Continuando con caché en memoria solamente');
      this.isConnected = false;
    }
  }

  async disconnect() {
    try {
      if (this.isConnected) {
        await mongoose.disconnect();
        this.isConnected = false;
        console.log('📦 MongoDB desconectado');
      }
    } catch (error) {
      console.error('❌ Error desconectando MongoDB:', error);
    }
  }

  isReady() {
    return this.isConnected && mongoose.connection.readyState === 1;
  }
}

// Instancias exportadas
export const store = new PlaylistStore();
export const database = new DatabaseConnection();

// Función para inicializar la base de datos
export const initializeDatabase = async () => {
  await database.connect();
}; 