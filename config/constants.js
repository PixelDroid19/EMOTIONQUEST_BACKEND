export const GEMINI_TEXT_MODEL_NAME = "gemini-2.0-flash-lite";
export const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1";
export const YOUTUBE_MUSIC_BASE_URL = "https://music.youtube.com";

export const RESPONSE_STATUS = {
  SUCCESS: "success",
  ERROR: "error",
  PARTIAL: "partial"
};

export const MOOD_MAPPINGS = {
  ANGRY: {
    keywords: ["angry", "rage", "furious", "intense", "aggressive"],
    description: "Dramatic, powerful classical pieces"
  },
  HAPPY: {
    keywords: ["happy", "joyful", "cheerful", "uplifting", "energetic"],
    description: "Uplifting, vivacious classical pieces"
  },
  SLEEP: {
    keywords: ["sleep", "relaxing", "calm", "peaceful", "meditative"],
    description: "Gentle, soothing classical pieces"
  },
  MAGIC: {
    keywords: ["magic", "mystical", "ethereal", "enchanting", "mysterious"],
    description: "Ethereal, enchanting classical pieces"
  },
  SAD: {
    keywords: ["sad", "melancholic", "sorrowful", "emotional", "dramatic"],
    description: "Emotional, introspective classical pieces"
  },
  PARTY: {
    keywords: ["party", "festive", "celebration", "dance", "lively"],
    description: "Celebratory, dance-like classical pieces"
  }
};

export const DEFAULT_PLAYLIST_CONFIG = {
  MIN_SONGS: 8,
  MAX_SONGS: 15,
  TARGET_SONGS: 10,
  DEFAULT_LANGUAGE: "any"
};

export const ERROR_MESSAGES = {
  MISSING_DESCRIPTION: "La descripción del usuario es requerida",
  INVALID_LANGUAGE: "Idioma no válido",
  AI_GENERATION_FAILED: "Error al generar la playlist con IA",
  YOUTUBE_SEARCH_FAILED: "Error al buscar canciones en YouTube Music",
  SPOTIFY_SEARCH_FAILED: "Error al buscar canciones en Spotify",
  SPOTIFY_PLAYLIST_CREATION_FAILED: "Error al crear playlist en Spotify",
  INSUFFICIENT_SONGS: "No se encontraron suficientes canciones",
  INVALID_ACCESS_TOKEN: "Token de acceso de Spotify inválido"
}; 