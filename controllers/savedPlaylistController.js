import mongoose from 'mongoose';
import Playlist from '../models/Playlist.js';
import { database } from '../config/database.js';
import { 
  createSpotifyPlaylist, 
  addTracksToSpotifyPlaylist,
  getSpotifyUserProfile 
} from '../services/spotifyService.js';
import { RESPONSE_STATUS, ERROR_MESSAGES } from '../config/constants.js';

/**
 * Guarda una playlist en MongoDB
 */
export async function savePlaylist(req, res) {
  try {
    const {
      title,
      description,
      emotion,
      language = 'any',
      songs,
      userId = null,
      sessionId = null,
      generatedWith = 'ai_only'
    } = req.body;

    if (!title || !description || !songs || songs.length === 0) {
      return res.status(400).json({
        status: RESPONSE_STATUS.ERROR,
        message: 'Título, descripción y canciones son requeridos'
      });
    }

    // Si MongoDB no está disponible, devolver error
    if (!database.isReady()) {
      return res.status(503).json({
        status: RESPONSE_STATUS.ERROR,
        message: 'Base de datos no disponible. No se puede guardar la playlist.'
      });
    }

    const playlistData = {
      title: title.trim(),
      description: description.trim(),
      emotion: emotion || 'other',
      language,
      songs,
      originalSongsCount: songs.length,
      userId,
      sessionId,
      generatedWith
    };

    const savedPlaylist = new Playlist(playlistData);
    await savedPlaylist.save();

    console.log(`💾 Playlist guardada: "${title}" (ID: ${savedPlaylist._id})`);

    res.status(201).json({
      status: RESPONSE_STATUS.SUCCESS,
      message: 'Playlist guardada exitosamente',
      data: {
        playlist: savedPlaylist.toJSON()
      }
    });

  } catch (error) {
    console.error('Error saving playlist:', error);
    res.status(500).json({
      status: RESPONSE_STATUS.ERROR,
      message: 'Error interno del servidor al guardar playlist',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Obtiene playlists de un usuario específico
 */
export async function getUserPlaylists(req, res) {
  try {
    const { userId } = req.params;
    const { limit = 20, emotion, page = 1 } = req.query;

    console.log(`🔍 Buscando playlists para usuario: ${userId}`);

    if (!userId) {
      return res.status(400).json({
        status: RESPONSE_STATUS.ERROR,
        message: 'ID de usuario requerido'
      });
    }

    if (!database.isReady()) {
      console.log('❌ Base de datos no está lista');
      return res.status(503).json({
        status: RESPONSE_STATUS.ERROR,
        message: 'Base de datos no disponible'
      });
    }

    console.log(`📊 Mongoose estado: ${mongoose.connection.readyState}`);
    console.log(`🏛️ Base de datos: ${mongoose.connection.db?.databaseName}`);
    console.log(`📋 Colección: ${Playlist.collection.name}`);

    const query = { userId };
    if (emotion && emotion !== 'all') {
      query.emotion = emotion;
    }

    const skip = (page - 1) * limit;
    const playlists = await Playlist.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Playlist.countDocuments(query);

    res.json({
      status: RESPONSE_STATUS.SUCCESS,
      message: `${playlists.length} playlists encontradas`,
      data: {
        playlists: playlists.map(p => p.toJSON()),
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error getting user playlists:', error);
    res.status(500).json({
      status: RESPONSE_STATUS.ERROR,
      message: 'Error obteniendo playlists del usuario',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Obtiene playlists por sessionId (para usuarios no logueados)
 */
export async function getSessionPlaylists(req, res) {
  try {
    const { sessionId } = req.params;
    const { limit = 10 } = req.query;

    if (!sessionId) {
      return res.status(400).json({
        status: RESPONSE_STATUS.ERROR,
        message: 'Session ID requerido'
      });
    }

    if (!database.isReady()) {
      return res.status(503).json({
        status: RESPONSE_STATUS.ERROR,
        message: 'Base de datos no disponible'
      });
    }

    const playlists = await Playlist.findBySession(sessionId, parseInt(limit));

    res.json({
      status: RESPONSE_STATUS.SUCCESS,
      message: `${playlists.length} playlists encontradas`,
      data: {
        playlists: playlists.map(p => p.toJSON())
      }
    });

  } catch (error) {
    console.error('Error getting session playlists:', error);
    res.status(500).json({
      status: RESPONSE_STATUS.ERROR,
      message: 'Error obteniendo playlists de la sesión',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Obtiene una playlist específica por ID
 */
export async function getPlaylistById(req, res) {
  try {
    const { id } = req.params;

    if (!database.isReady()) {
      return res.status(503).json({
        status: RESPONSE_STATUS.ERROR,
        message: 'Base de datos no disponible'
      });
    }

    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({
        status: RESPONSE_STATUS.ERROR,
        message: 'Playlist no encontrada'
      });
    }

    res.json({
      status: RESPONSE_STATUS.SUCCESS,
      message: 'Playlist encontrada',
      data: {
        playlist: playlist.toJSON()
      }
    });

  } catch (error) {
    console.error('Error getting playlist by ID:', error);
    res.status(500).json({
      status: RESPONSE_STATUS.ERROR,
      message: 'Error obteniendo playlist',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Crea una playlist en Spotify desde una playlist guardada
 */
export async function createSpotifyFromSaved(req, res) {
  try {
    const { id } = req.params;
    const { spotifyAccessToken, customTitle, customDescription } = req.body;

    if (!spotifyAccessToken) {
      return res.status(400).json({
        status: RESPONSE_STATUS.ERROR,
        message: 'Token de Spotify requerido'
      });
    }

    if (!database.isReady()) {
      return res.status(503).json({
        status: RESPONSE_STATUS.ERROR,
        message: 'Base de datos no disponible'
      });
    }

    // Obtener playlist guardada
    const savedPlaylist = await Playlist.findById(id);
    if (!savedPlaylist) {
      return res.status(404).json({
        status: RESPONSE_STATUS.ERROR,
        message: 'Playlist no encontrada'
      });
    }

    // Verificar si ya tiene playlist de Spotify asociada
    if (savedPlaylist.spotifyPlaylistId) {
      return res.status(409).json({
        status: RESPONSE_STATUS.ERROR,
        message: 'Esta playlist ya tiene una versión en Spotify',
        data: {
          spotifyUrl: savedPlaylist.spotifyPlaylistUrl
        }
      });
    }

    // Obtener perfil del usuario
    const userProfile = await getSpotifyUserProfile(spotifyAccessToken);

    // Crear playlist en Spotify
    const spotifyTitle = customTitle || savedPlaylist.title;
    const spotifyDescription = customDescription || savedPlaylist.description;

    const newSpotifyPlaylist = await createSpotifyPlaylist(
      spotifyAccessToken,
      userProfile.id,
      spotifyTitle,
      spotifyDescription,
      true
    );

    // Agregar canciones que tengan URI de Spotify
    const tracksWithUri = savedPlaylist.songs.filter(song => song.spotifyUri);
    
    if (tracksWithUri.length > 0) {
      const trackUris = tracksWithUri.map(song => song.spotifyUri);
      await addTracksToSpotifyPlaylist(
        spotifyAccessToken,
        newSpotifyPlaylist.id,
        trackUris
      );
    }

    // Actualizar playlist guardada con información de Spotify
    await savedPlaylist.addSpotifyInfo(newSpotifyPlaylist);

    console.log(`🎧 Playlist creada en Spotify: "${newSpotifyPlaylist.name}" (${tracksWithUri.length} canciones)`);

    res.json({
      status: RESPONSE_STATUS.SUCCESS,
      message: `Playlist creada en Spotify con ${tracksWithUri.length} canciones`,
      data: {
        spotify: {
          id: newSpotifyPlaylist.id,
          name: newSpotifyPlaylist.name,
          url: newSpotifyPlaylist.external_urls.spotify,
          tracksAdded: tracksWithUri.length
        },
        saved: {
          id: savedPlaylist._id,
          title: savedPlaylist.title,
          totalSongs: savedPlaylist.totalSongs
        }
      }
    });

  } catch (error) {
    console.error('Error creating Spotify playlist from saved:', error);
    
    if (error.message.includes('invalid') || error.message.includes('expired')) {
      return res.status(401).json({
        status: RESPONSE_STATUS.ERROR,
        message: 'Token de Spotify inválido o expirado'
      });
    }

    res.status(500).json({
      status: RESPONSE_STATUS.ERROR,
      message: 'Error creando playlist en Spotify',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Elimina una playlist guardada
 */
export async function deletePlaylist(req, res) {
  try {
    const { id } = req.params;
    const { userId } = req.body; // Para verificar permisos

    if (!database.isReady()) {
      return res.status(503).json({
        status: RESPONSE_STATUS.ERROR,
        message: 'Base de datos no disponible'
      });
    }

    const playlist = await Playlist.findById(id);
    if (!playlist) {
      return res.status(404).json({
        status: RESPONSE_STATUS.ERROR,
        message: 'Playlist no encontrada'
      });
    }

    // Verificar permisos (solo el propietario puede eliminar)
    if (playlist.userId && userId && playlist.userId !== userId) {
      return res.status(403).json({
        status: RESPONSE_STATUS.ERROR,
        message: 'No tienes permisos para eliminar esta playlist'
      });
    }

    await Playlist.findByIdAndDelete(id);

    console.log(`🗑️ Playlist eliminada: "${playlist.title}" (ID: ${id})`);

    res.json({
      status: RESPONSE_STATUS.SUCCESS,
      message: 'Playlist eliminada exitosamente'
    });

  } catch (error) {
    console.error('Error deleting playlist:', error);
    res.status(500).json({
      status: RESPONSE_STATUS.ERROR,
      message: 'Error eliminando playlist',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Obtiene estadísticas de playlists guardadas
 */
export async function getPlaylistStats(req, res) {
  try {
    console.log(`📈 Obteniendo estadísticas de playlists`);

    if (!database.isReady()) {
      console.log('❌ Base de datos no está lista para estadísticas');
      return res.status(503).json({
        status: RESPONSE_STATUS.ERROR,
        message: 'Base de datos no disponible'
      });
    }

    console.log(`📊 Mongoose estado: ${mongoose.connection.readyState}`);
    console.log(`🏛️ Base de datos: ${mongoose.connection.db?.databaseName}`);
    console.log(`📋 Colección: ${Playlist.collection.name}`);

    const totalPlaylists = await Playlist.countDocuments();
    const playlistsByEmotion = await Playlist.aggregate([
      { $group: { _id: '$emotion', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    const recentPlaylists = await Playlist.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });

    res.json({
      status: RESPONSE_STATUS.SUCCESS,
      message: 'Estadísticas obtenidas exitosamente',
      data: {
        total: totalPlaylists,
        recentWeek: recentPlaylists,
        byEmotion: playlistsByEmotion,
        database: {
          connected: database.isReady(),
          type: 'MongoDB'
        }
      }
    });

  } catch (error) {
    console.error('Error getting playlist stats:', error);
    res.status(500).json({
      status: RESPONSE_STATUS.ERROR,
      message: 'Error obteniendo estadísticas',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
} 