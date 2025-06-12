import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_TEXT_MODEL_NAME, MOOD_MAPPINGS } from "../config/constants.js";

// Función para obtener la instancia de AI con verificación lazy
function getAIInstance() {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY environment variable not set");
  }
  return new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
}

function parseJsonFromGeminiResponse(text) {
  let jsonStr = text.trim();
  
  // Remover markdown code blocks si existen
  const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
  const match = jsonStr.match(fenceRegex);
  if (match && match[2]) {
    jsonStr = match[2].trim();
  }
  
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse JSON response:", jsonStr, e);
    throw new Error("Failed to parse AI response as JSON. The response might be malformed.");
  }
}

/**
 * Detecta el estado de ánimo principal de la descripción del usuario
 */
function detectMood(userDescription) {
  const description = userDescription.toLowerCase();
  
  for (const [mood, config] of Object.entries(MOOD_MAPPINGS)) {
    if (config.keywords.some(keyword => description.includes(keyword))) {
      return mood;
    }
  }
  
  return null; // No mood detectado
}

/**
 * Genera playlist de música clásica basada en la descripción del usuario
 */
export async function generateClassicalPlaylist(userDescription = "", language = "any") {
  console.log(`🎼 Generating classical playlist for: "${userDescription}", Language: ${language}`);

  const detectedMood = detectMood(userDescription);
  console.log(`🎯 Detected mood: ${detectedMood || 'neutral'}`);

  let languageInstruction = "";
  if (language && language.toLowerCase() !== "any") {
    languageInstruction = `\nIMPORTANT: Focus on classical music from the ${language} tradition or region when possible.`;
  }

  let moodInstruction = "";
  if (detectedMood && MOOD_MAPPINGS[detectedMood]) {
    moodInstruction = `\nMOOD GUIDANCE: The user seems to want ${MOOD_MAPPINGS[detectedMood].description}.`;
  }

  const prompt = `Eres un experto curador de música clásica mundial. Tu misión es crear una playlist coherente y emocionalmente satisfactoria basada en la descripción del usuario.

Descripción del usuario: "${userDescription}"
${languageInstruction}
${moodInstruction}

ENFOQUE EN MÚSICA CLÁSICA: Debes crear una playlist que consista EXCLUSIVAMENTE de piezas de música clásica. Según el estado de ánimo/descripción del usuario, selecciona obras clásicas apropiadas:

GUÍAS POR ESTADO DE ÁNIMO:
- Para ANGRY/INTENSE: Piezas dramáticas y poderosas (Beethoven sinfonías, Wagner, Stravinsky La Consagración de la Primavera, Prokofiev, Rachmaninoff)
- Para HAPPY/JOYFUL: Piezas alegres y vivaces (Mozart, Vivaldi Las Cuatro Estaciones, oberturas de Rossini, Danzas Húngaras de Brahms)
- Para SLEEP/RELAXING: Piezas gentiles y relajantes (Debussy, Satie, Nocturnos de Chopin, Aire en Sol de Bach, Canon de Pachelbel)
- Para MAGIC/MYSTICAL: Piezas etéreas y encantadoras (Bolero de Ravel, Claro de Luna de Debussy, Peer Gynt de Grieg, música de ballet)
- Para SAD/MELANCHOLIC: Piezas emotivas e introspectivas (Chopin, Schubert, Adagio de Barber, Adagio de Albinoni)
- Para PARTY/FESTIVE: Piezas festivas y danzantes (valses de Strauss, Can-Can de Offenbach, Danzas Húngaras de Brahms, ballets de Tchaikovsky)

INSTRUCCIONES CLAVE:
1. ANÁLISIS Y SELECCIÓN:
   - Interpreta profundamente el estado de ánimo de la descripción.
   - Selecciona 10-12 piezas de MÚSICA CLÁSICA que se ajusten perfectamente.
   - Prioriza obras y compositores CONOCIDOS Y POPULARES para garantizar disponibilidad.
   - Usa nombres exactos de las piezas (ej: "Sinfonía No. 9 en Re menor, Op. 125" por "Ludwig van Beethoven").

2. ORDENAMIENTO INTELIGENTE (Flujo Musical):
   - Esta es la parte más importante. Ordena las piezas para crear una experiencia auditiva lógica.
   - Piensa como un director de orquesta. Considera flujo de energía, tempo y emoción.
   - Ejemplo: Para "motivación para estudiar", comienza calmado (Satie), construye hacia más complejo (Bach, Mozart), termina triunfante pero no distractor.

3. FORMATO DE SALIDA:
   - Respuesta ESTRICTAMENTE en formato JSON.
   - El array "songs" DEBE contener exactamente 10 canciones, ya en su orden final.

RESPONDE SOLO CON ESTE JSON (sin texto adicional):
{
  "title": "Título Creativo y Relevante",
  "description": "Descripción corta que capture la esencia y flujo (1-2 frases)",
  "songs": [
    { "title": "Título de la Pieza 1", "artist": "Compositor 1" },
    { "title": "Título de la Pieza 2", "artist": "Compositor 2" }
  ]
}

REGLAS CRÍTICAS:
1. Output debe ser SOLO el objeto JSON
2. NO uses formateo markdown
3. JSON debe ser válido y bien formado
4. Exactamente 10 piezas de música clásica
5. Usa convenciones apropiadas de nomenclatura clásica
6. Sin texto conversacional dentro de los valores JSON`;

  try {
    const ai = getAIInstance();
    const model = ai.getGenerativeModel({ model: GEMINI_TEXT_MODEL_NAME });
    
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
    });

    const response = await result.response;
    const rawData = parseJsonFromGeminiResponse(response.text());

    // Validar respuesta
    if (!rawData.title || !rawData.description || !Array.isArray(rawData.songs)) {
      throw new Error("AI response is missing required fields (title, description, or songs).");
    }

    if (rawData.songs.length === 0) {
      throw new Error("AI returned no songs for the playlist.");
    }

    if (rawData.songs.some(song => typeof song.title !== "string" || typeof song.artist !== "string")) {
      throw new Error("AI response for songs has an invalid format (title or artist is not a string).");
    }

    // Asegurar exactamente 10 canciones
    if (rawData.songs.length > 10) {
      rawData.songs = rawData.songs.slice(0, 10);
    }

    console.log(`✅ Generated classical playlist: "${rawData.title}" with ${rawData.songs.length} songs`);
    
    return rawData;

  } catch (error) {
    console.error("Error generating classical playlist:", error);
    if (error instanceof Error) {
      if (error.message.startsWith("Failed to parse AI response")) throw error;
      throw new Error(`Failed to generate classical playlist: ${error.message}`);
    }
    throw new Error("An unknown error occurred while generating classical playlist.");
  }
}

/**
 * Refina una playlist existente basándose en características de audio de Spotify
 */
export async function refinePlaylistWithAudioFeatures(userOriginalPrompt = "", songsWithFeatures = []) {
  const validSongsForRefinement = songsWithFeatures.filter(song => song.uri && song.id);

  if (validSongsForRefinement.length === 0) {
    console.warn("No songs with Spotify URIs provided for AI refinement.");
    return songsWithFeatures
      .filter(s => s.uri)
      .map(s => ({ title: s.title, artist: s.artist, uri: s.uri }));
  }

  const prompt = `Eres un curador experto de playlists con profundo conocimiento de teoría musical y características de audio.
Tu tarea es refinar una lista de canciones clásicas para mejorar la cohesión y flujo según la solicitud del usuario.

Solicitud original del usuario: "${userOriginalPrompt}"

Lista actual de canciones con sus características de audio de Spotify:
${JSON.stringify(validSongsForRefinement.map(s => ({
    title: s.title,
    artist: s.artist,
    uri: s.uri,
    audioFeatures: s.audioFeatures ? {
      danceability: s.audioFeatures.danceability,
      energy: s.audioFeatures.energy,
      tempo: s.audioFeatures.tempo,
      valence: s.audioFeatures.valence,
      acousticness: s.audioFeatures.acousticness,
      instrumentalness: s.audioFeatures.instrumentalness,
    } : null,
  })), null, 2)}

Explicación de características de audio (valores típicamente 0-1, tempo en BPM):
- danceability: Qué tan adecuada es para bailar
- energy: Intensidad y actividad percibida
- tempo: Pulsos por minuto
- valence: Positividad musical (feliz/triste)
- acousticness: Confianza en naturaleza acústica
- instrumentalness: Probabilidad de no tener voces

Instrucciones para refinamiento:
1. Analiza la solicitud original para entender el estado de ánimo deseado
2. Examina las características de audio de cada canción donde estén disponibles
3. Re-ordena las canciones para crear la mejor experiencia de escucha posible
4. La playlist final DEBE contener exactamente 10 canciones
5. DEBES seleccionar estas canciones de la lista proporcionada. NO inventes nuevas canciones
6. Prioriza canciones con características de audio disponibles para decisiones informadas

Tu salida DEBE ser SOLO un array JSON de la lista refinada de objetos de canciones.
Cada objeto de canción DEBE incluir "title", "artist", y el "uri" original proporcionado.

Retorna el array JSON así:
[
  { "title": "...", "artist": "...", "uri": "..." }
]`;

  try {
    const ai = getAIInstance();
    const model = ai.getGenerativeModel({ model: GEMINI_TEXT_MODEL_NAME });
    
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      },
    });

    const response = await result.response;
    const refinedSongs = parseJsonFromGeminiResponse(response.text());

    if (!Array.isArray(refinedSongs) || 
        refinedSongs.some(song => !song.title || !song.artist || !song.uri)) {
      console.error("AI refinement response is not a valid array of songs:", refinedSongs);
      throw new Error("AI refinement response has an invalid format.");
    }

    // Verificar que los URIs retornados están en el set original
    const originalUris = new Set(validSongsForRefinement.map(s => s.uri));
    for (const refinedSong of refinedSongs) {
      if (!originalUris.has(refinedSong.uri)) {
        console.error(`AI returned a song with an unknown URI: ${refinedSong.uri}`, refinedSong);
        throw new Error("AI refinement included a song with a URI not present in the original list.");
      }
    }

    console.log(`✅ Refined playlist with ${refinedSongs.length} songs`);
    return refinedSongs;

  } catch (error) {
    console.error("Error refining playlist with audio features:", error);
    if (error instanceof Error) {
      if (error.message.startsWith("Failed to parse AI response")) throw error;
      throw new Error(`Failed to refine playlist: ${error.message}`);
    }
    throw new Error("An unknown error occurred during playlist refinement.");
  }
}

/**
 * Genera playlist de respaldo con piezas clásicas muy conocidas
 */
export async function generateFallbackClassicalPlaylist(userDescription = "", language = "any") {
  let languageInstruction = "";
  if (language && language.toLowerCase() !== "any") {
    languageInstruction = `\nIMPORTANT: Focus on classical music from the ${language} tradition when possible.`;
  }

  const fallbackPrompt = `Genera una playlist de música clásica con SOLO piezas clásicas extremadamente conocidas y mainstream que definitivamente existen en Spotify/YouTube Music.

Descripción del usuario: "${userDescription}"
${languageInstruction}

ENFOQUE EN MÚSICA CLÁSICA: Concéntrate en las piezas clásicas más famosas y compositores más conocidos. Ejemplos:
- Sinfonías y sonatas más famosas de Beethoven
- Conciertos y sinfonías más populares de Mozart  
- Grandes éxitos de Bach (Conciertos de Brandenburg, Clave Bien Temperado)
- Piezas más queridas de Chopin (Nocturnos, Estudios, Baladas)
- Las Cuatro Estaciones de Vivaldi
- Canon de Pachelbel
- Claro de Luna de Debussy
- Ballets y sinfonías de Tchaikovsky

Retorna formato JSON:
{
  "title": "TÍTULO_PLAYLIST_CLÁSICA",
  "description": "DESCRIPCIÓN_PLAYLIST_CLÁSICA",
  "songs": [
    { "title": "TÍTULO_PIEZA_EXACTO", "artist": "NOMBRE_COMPOSITOR" }
  ]
}`;

  try {
    const ai = getAIInstance();
    const model = ai.getGenerativeModel({ model: GEMINI_TEXT_MODEL_NAME });
    
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: fallbackPrompt }] }],
      generationConfig: {
        temperature: 0.3, // Muy bajo para sugerencias conservadoras
        topK: 20,
        topP: 0.9,
        maxOutputTokens: 1024,
      },
    });

    const response = await result.response;
    const rawData = parseJsonFromGeminiResponse(response.text());

    console.log(`✅ Generated fallback classical playlist: "${rawData.title}"`);
    return rawData;

  } catch (error) {
    console.error("Error generating fallback classical playlist:", error);
    throw new Error(`Failed to generate fallback playlist: ${error.message}`);
  }
} 