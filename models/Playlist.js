import mongoose from 'mongoose';

// Esquema para las canciones individuales
const songSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  artist: {
    type: String,
    required: true,
    trim: true
  },
  duration: {
    type: String,
    default: null
  },
  videoId: {
    type: String,
    default: null
  },
  playbackUrl: {
    type: String,
    default: null
  },
  thumbnails: [{
    url: String,
    width: Number,
    height: Number
  }],
  spotifyUri: {
    type: String,
    default: null
  },
  // Datos originales para búsquedas
  originalTitle: {
    type: String,
    default: null
  },
  originalArtist: {
    type: String,
    default: null
  }
}, { _id: false });

// Esquema principal de Playlist
const playlistSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  emotion: {
    type: String,
    enum: ['angry', 'happy', 'sleep', 'magic', 'sad', 'party', 'other'],
    default: 'other'
  },
  language: {
    type: String,
    default: 'any',
    trim: true
  },
  songs: [songSchema],
  totalSongs: {
    type: Number,
    default: 0
  },
  originalSongsCount: {
    type: Number,
    default: 0
  },
  // Información del usuario (opcional)
  userId: {
    type: String,
    default: null,
    index: true
  },
  userEmail: {
    type: String,
    default: null
  },
  // Información de Spotify
  spotifyPlaylistId: {
    type: String,
    default: null
  },
  spotifyPlaylistUrl: {
    type: String,
    default: null
  },
  spotifyCreatedAt: {
    type: Date,
    default: null
  },
  // Session tracking para usuarios no logueados
  sessionId: {
    type: String,
    default: null,
    index: true
  },
  // Metadatos
  generatedWith: {
    type: String,
    enum: ['ai_only', 'ai_with_spotify', 'spotify_validated'],
    default: 'ai_only'
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true,
  collection: 'saved_playlists'
});

// Índices para optimizar búsquedas
playlistSchema.index({ userId: 1, createdAt: -1 });
playlistSchema.index({ sessionId: 1, createdAt: -1 });
playlistSchema.index({ emotion: 1, language: 1 });
playlistSchema.index({ isPublic: 1, createdAt: -1 });

// Middleware para actualizar totalSongs antes de guardar
playlistSchema.pre('save', function(next) {
  if (this.songs) {
    this.totalSongs = this.songs.length;
  }
  next();
});

// Métodos del esquema
playlistSchema.methods.toJSON = function() {
  const playlist = this.toObject();
  
  // Crear ID compatible con el sistema actual
  playlist.id = playlist._id.toString();
  
  return playlist;
};

playlistSchema.methods.addSpotifyInfo = function(spotifyPlaylistData) {
  this.spotifyPlaylistId = spotifyPlaylistData.id;
  this.spotifyPlaylistUrl = spotifyPlaylistData.external_urls?.spotify;
  this.spotifyCreatedAt = new Date();
  return this.save();
};

// Métodos estáticos
playlistSchema.statics.findByUser = function(userId, limit = 20) {
  return this.find({ userId }).sort({ createdAt: -1 }).limit(limit);
};

playlistSchema.statics.findBySession = function(sessionId, limit = 10) {
  return this.find({ sessionId }).sort({ createdAt: -1 }).limit(limit);
};

playlistSchema.statics.findPublic = function(emotion = null, limit = 20) {
  const query = { isPublic: true };
  if (emotion) {
    query.emotion = emotion;
  }
  return this.find(query).sort({ createdAt: -1 }).limit(limit);
};

const Playlist = mongoose.model('Playlist', playlistSchema);

export default Playlist; 