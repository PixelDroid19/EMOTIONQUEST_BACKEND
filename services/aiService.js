import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_TEXT_MODEL_NAME, MOOD_MAPPINGS } from "../config/constants.js";

// Function to get AI instance with lazy verification
function getAIInstance() {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY environment variable not set");
  }
  return new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
}

function parseJsonFromGeminiResponse(text) {
  let jsonStr = text.trim();

  // Remove markdown code blocks if they exist
  const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
  const match = jsonStr.match(fenceRegex);
  if (match && match[2]) {
    jsonStr = match[2].trim();
  }

  // Function to normalize quotes in JSON
  const normalizeJsonQuotes = (str) => {
    try {
      // 1. Normalize all property quotes to double quotes
      str = str.replace(/([{,]\s*)['"`]([^'"`]+)['"`]\s*:/g, '$1"$2":');

      // 2. Normalize string value quotes - convert everything to double quotes
      str = str.replace(/:\s*['`]([^'`]*)['`]/g, ': "$1"');

      // 3. Clean problematic mixed quotes at start/end of values
      str = str.replace(/:\s*"([^"]*)'(\s*[,}])/g, ': "$1"$2');
      str = str.replace(/:\s*'([^']*)"(\s*[,}])/g, ': "$1"$2');

      // 4. Escape double quotes inside string values
      str = str.replace(/"([^"]*)":\s*"([^"]*)"/g, (match, key, value) => {
        // Only process if the value contains unescaped quotes
        if (value.includes('"') && !value.includes('\\"')) {
          const escapedValue = value.replace(/"/g, '\\"');
          return `"${key}": "${escapedValue}"`;
        }
        return match;
      });

      return str;
    } catch (error) {
      console.error("Error in normalizeJsonQuotes:", error);
      return str;
    }
  };

  // Last resort function - create valid JSON manually
  const createValidJsonFromText = (text) => {
    try {
      // Extract basic parts using more flexible regex
      const titleMatch = text.match(
        /(?:title['"`]?\s*[:=]\s*['"`]?)([^'"`\n]+)['"`]?/i
      );
      const descMatch = text.match(
        /(?:description['"`]?\s*[:=]\s*['"`]?)([^'"`\n]+)['"`]?/i
      );

      // Extract songs with more permissive regex
      const songsSection = text.match(/songs['"`]?\s*[:=]\s*\[([^\]]+)\]/is);
      const songs = [];

      if (songsSection) {
        const songsText = songsSection[1];
        const songMatches = songsText.match(/\{[^}]+\}/g);

        if (songMatches) {
          songMatches.forEach((songText) => {
            const titleMatch = songText.match(
              /(?:title['"`]?\s*[:=]\s*['"`]?)([^'"`\n,}]+)/i
            );
            const artistMatch = songText.match(
              /(?:artist['"`]?\s*[:=]\s*['"`]?)([^'"`\n,}]+)/i
            );

            if (titleMatch && artistMatch) {
              songs.push({
                title: titleMatch[1].trim(),
                artist: artistMatch[1].trim(),
              });
            }
          });
        }
      }

      // Create valid JSON manually
      const validJson = {
        title: titleMatch ? titleMatch[1].trim() : "Classical Playlist",
        description: descMatch
          ? descMatch[1].trim()
          : "A curated collection of classical music",
        songs: songs.slice(0, 10), // Ensure maximum 10 songs
      };

      return validJson;
    } catch (error) {
      console.error("Error in createValidJsonFromText:", error);
      // Final fallback
      return {
        title: "Emergency Classical Playlist",
        description: "System-generated backup playlist",
        songs: [
          { title: "Canon in D Major", artist: "Johann Pachelbel" },
          { title: "Clair de Lune", artist: "Claude Debussy" },
          { title: "Ave Maria", artist: "Franz Schubert" },
          {
            title: "Eine kleine Nachtmusik",
            artist: "Wolfgang Amadeus Mozart",
          },
          { title: "Spring (The Four Seasons)", artist: "Antonio Vivaldi" },
          { title: "Für Elise", artist: "Ludwig van Beethoven" },
          { title: "Gymnopédie No. 1", artist: "Erik Satie" },
          { title: "The Swan", artist: "Camille Saint-Saëns" },
          { title: "Barcarolle", artist: "Jacques Offenbach" },
          { title: "Air on the G String", artist: "Johann Sebastian Bach" },
        ],
      };
    }
  };

  // Attempt parsing with multiple strategies
  try {
    // Attempt 1: Direct parsing
    return JSON.parse(jsonStr);
  } catch (firstError) {
    console.log("First parsing attempt failed, normalizing quotes...");

    try {
      // Attempt 2: Normalize quotes and parse
      const normalizedJson = normalizeJsonQuotes(jsonStr);
      console.log("Normalized JSON:", normalizedJson);
      return JSON.parse(normalizedJson);
    } catch (secondError) {
      console.log("Second attempt failed, extracting data manually...");

      try {
        // Attempt 3: Manual extraction and valid JSON construction
        const manualJson = createValidJsonFromText(jsonStr);
        console.log(
          "Manually created JSON:",
          JSON.stringify(manualJson, null, 2)
        );
        return manualJson;
      } catch (thirdError) {
        console.error("All parsing attempts failed:");
        console.error("Error 1:", firstError.message);
        console.error("Error 2:", secondError.message);
        console.error("Error 3:", thirdError.message);
        console.error("Original JSON:", jsonStr);

        // Use emergency fallback
        console.log("🚨 Using emergency playlist");
        return createValidJsonFromText(""); // Returns the final fallback
      }
    }
  }
}

/**
 * Detects the main mood from the user's description
 */
function detectMood(userDescription) {
  const description = userDescription.toLowerCase();

  for (const [mood, config] of Object.entries(MOOD_MAPPINGS)) {
    if (config.keywords.some((keyword) => description.includes(keyword))) {
      return mood;
    }
  }

  return null; // No mood detected
}

/**
 * Generates a classical music playlist based on user description
 */
export async function generateClassicalPlaylist(
  userDescription = "",
  language = "any"
) {
  console.log(
    `🎼 Generating classical playlist for: "${userDescription}", Language: ${language}`
  );

  const detectedMood = detectMood(userDescription);
  console.log(`🎯 Detected mood: ${detectedMood || "neutral"}`);

  let languageInstruction = "";
  if (language && language.toLowerCase() !== "any") {
    languageInstruction = `\nIMPORTANT: Focus on classical music from the ${language} tradition or region when possible.`;
  }

  let moodInstruction = "";
  if (detectedMood && MOOD_MAPPINGS[detectedMood]) {
    moodInstruction = `\nMOOD GUIDANCE: The user seems to want ${MOOD_MAPPINGS[detectedMood].description}.`;
  }

  const prompt = `You are an expert curator of world classical music. Your mission is to create a coherent and emotionally satisfying playlist based on the user's description.

User description: "${userDescription}"
${languageInstruction}
${moodInstruction}

FOCUS ON CLASSICAL MUSIC: You must create a playlist consisting EXCLUSIVELY of classical music pieces. According to the user's mood/description, select appropriate classical works:

MOOD GUIDELINES:
- For ANGRY/INTENSE: Dramatic and powerful pieces (Beethoven symphonies, Wagner, Stravinsky The Rite of Spring, Prokofiev, Rachmaninoff)
- For HAPPY/JOYFUL: Cheerful and lively pieces (Mozart, Vivaldi The Four Seasons, Rossini overtures, Brahms Hungarian Dances)
- For SLEEP/RELAXING: Gentle and relaxing pieces (Debussy, Satie, Chopin Nocturnes, Bach Air on G String, Pachelbel Canon)
- For MAGIC/MYSTICAL: Ethereal and enchanting pieces (Ravel Bolero, Debussy Clair de Lune, Grieg Peer Gynt, ballet music)
- For SAD/MELANCHOLIC: Emotional and introspective pieces (Chopin, Schubert, Barber Adagio, Albinoni Adagio)
- For PARTY/FESTIVE: Festive and dance-like pieces (Strauss waltzes, Offenbach Can-Can, Brahms Hungarian Dances, Tchaikovsky ballets)

KEY INSTRUCTIONS:
1. ANALYSIS AND SELECTION:
   - Deeply interpret the mood from the description.
   - Select 10-12 CLASSICAL MUSIC pieces that fit perfectly.
   - Prioritize WELL-KNOWN AND POPULAR works and composers to ensure availability.
   - Use exact piece names (e.g. "Symphony No. 9 in D minor, Op. 125" by "Ludwig van Beethoven").

2. INTELLIGENT ORDERING (Musical Flow):
   - This is the most important part. Order the pieces to create a logical listening experience.
   - Think like a conductor. Consider energy flow, tempo, and emotion.
   - Example: For "study motivation", start calm (Satie), build to more complex (Bach, Mozart), end triumphant but not distracting.

3. OUTPUT FORMAT:
   - Response STRICTLY in JSON format.
   - The "songs" array MUST contain exactly 10 songs, already in their final order.

RESPOND ONLY WITH THIS JSON (no additional text):
{
  "title": "Creative and Relevant Title",
  "description": "Short description that captures the essence and flow (1-2 sentences)",
  "songs": [
    { "title": "Piece Title 1", "artist": "Composer 1" },
    { "title": "Piece Title 2", "artist": "Composer 2" }
  ]
}

CRITICAL RULES:
1. Output must be ONLY the valid JSON object
2. USE ONLY double quotes (") for all properties and values
3. DO NOT use markdown formatting or code blocks
4. JSON must be valid and well-formed without special characters
5. Exactly 10 classical music pieces in the songs array
6. Use appropriate classical nomenclature conventions
7. No conversational text within JSON values
8. IMPORTANT: DO NOT use double quotes (") inside titles or names - use single quotes (') if necessary
9. Avoid special characters that might break the JSON
10. The JSON must be parseable directly without modifications`;

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

    // Validate response
    if (
      !rawData.title ||
      !rawData.description ||
      !Array.isArray(rawData.songs)
    ) {
      throw new Error(
        "AI response is missing required fields (title, description, or songs)."
      );
    }

    if (rawData.songs.length === 0) {
      throw new Error("AI returned no songs for the playlist.");
    }

    if (
      rawData.songs.some(
        (song) =>
          typeof song.title !== "string" || typeof song.artist !== "string"
      )
    ) {
      throw new Error(
        "AI response for songs has an invalid format (title or artist is not a string)."
      );
    }

    // Ensure exactly 10 songs
    if (rawData.songs.length > 10) {
      rawData.songs = rawData.songs.slice(0, 10);
    }

    console.log(
      `✅ Generated classical playlist: "${rawData.title}" with ${rawData.songs.length} songs`
    );

    return rawData;
  } catch (error) {
    console.error("Error generating classical playlist:", error);
    if (error instanceof Error) {
      if (error.message.startsWith("Failed to parse AI response")) throw error;
      throw new Error(
        `Failed to generate classical playlist: ${error.message}`
      );
    }
    throw new Error(
      "An unknown error occurred while generating classical playlist."
    );
  }
}

/**
 * Refines an existing playlist based on Spotify audio characteristics
 */
export async function refinePlaylistWithAudioFeatures(
  userOriginalPrompt = "",
  songsWithFeatures = []
) {
  const validSongsForRefinement = songsWithFeatures.filter(
    (song) => song.uri && song.id
  );

  if (validSongsForRefinement.length === 0) {
    console.warn("No songs with Spotify URIs provided for AI refinement.");
    return songsWithFeatures
      .filter((s) => s.uri)
      .map((s) => ({ title: s.title, artist: s.artist, uri: s.uri }));
  }

  const prompt = `You are an expert playlist curator with deep knowledge of music theory and audio characteristics.
Your task is to refine a list of classical songs to improve cohesion and flow according to the user's request.

User's original request: "${userOriginalPrompt}"

Current song list with their Spotify audio characteristics:
${JSON.stringify(
  validSongsForRefinement.map((s) => ({
    title: s.title,
    artist: s.artist,
    uri: s.uri,
    audioFeatures: s.audioFeatures
      ? {
          danceability: s.audioFeatures.danceability,
          energy: s.audioFeatures.energy,
          tempo: s.audioFeatures.tempo,
          valence: s.audioFeatures.valence,
          acousticness: s.audioFeatures.acousticness,
          instrumentalness: s.audioFeatures.instrumentalness,
        }
      : null,
  })),
  null,
  2
)}

Audio characteristics explanation (values typically 0-1, tempo in BPM):
- danceability: How suitable the track is for dancing
- energy: Perceived intensity and activity
- tempo: Beats per minute
- valence: Musical positivity (happy/sad)
- acousticness: Confidence in acoustic nature
- instrumentalness: Probability of having no vocals

Refinement instructions:
1. Analyze the original request to understand the desired mood
2. Examine each song's audio characteristics where available
3. Re-order the songs to create the best possible listening experience
4. The final playlist MUST contain exactly 10 songs
5. You MUST select these songs from the provided list. DO NOT invent new songs
6. Prioritize songs with available audio characteristics for informed decisions

Your output MUST be ONLY a JSON array of the refined song list.
Each song object MUST include "title", "artist", and the original "uri" provided.

Return the JSON array like this:
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

    if (
      !Array.isArray(refinedSongs) ||
      refinedSongs.some((song) => !song.title || !song.artist || !song.uri)
    ) {
      console.error(
        "AI refinement response is not a valid array of songs:",
        refinedSongs
      );
      throw new Error("AI refinement response has an invalid format.");
    }

    // Verify that returned URIs are in the original set
    const originalUris = new Set(validSongsForRefinement.map((s) => s.uri));
    for (const refinedSong of refinedSongs) {
      if (!originalUris.has(refinedSong.uri)) {
        console.error(
          `AI returned a song with an unknown URI: ${refinedSong.uri}`,
          refinedSong
        );
        throw new Error(
          "AI refinement included a song with a URI not present in the original list."
        );
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
 * Generates fallback playlist with very well-known classical pieces
 */
export async function generateFallbackClassicalPlaylist(
  userDescription = "",
  language = "any"
) {
  let languageInstruction = "";
  if (language && language.toLowerCase() !== "any") {
    languageInstruction = `\nIMPORTANT: Focus on classical music from the ${language} tradition when possible.`;
  }

  const fallbackPrompt = `Generate a classical music playlist with ONLY extremely well-known and mainstream classical pieces that definitely exist on Spotify/YouTube Music.

User description: "${userDescription}"
${languageInstruction}

FOCUS ON CLASSICAL MUSIC: Concentrate on the most famous classical pieces and best-known composers. Examples:
- Most famous Beethoven symphonies and sonatas
- Most popular Mozart concertos and symphonies  
- Bach's greatest hits (Brandenburg Concertos, Well-Tempered Clavier)
- Chopin's most beloved pieces (Nocturnes, Etudes, Ballades)
- Vivaldi's Four Seasons
- Pachelbel's Canon
- Debussy's Clair de Lune
- Tchaikovsky's ballets and symphonies

CRITICAL INSTRUCTIONS:
1. EXACTLY 10 songs in the "songs" array
2. Only use extremely well-known and popular pieces
3. Use exact names of composers and works
4. DO NOT use double quotes (") inside titles or names - use single quotes (') if necessary
5. Avoid special characters that might break the JSON

Return JSON format:
{
  "title": "CLASSICAL_PLAYLIST_TITLE",
  "description": "CLASSICAL_PLAYLIST_DESCRIPTION",
  "songs": [
    { "title": "EXACT_PIECE_TITLE", "artist": "COMPOSER_NAME" }
  ]
}

IMPORTANT: 
- The "songs" array MUST contain exactly 10 elements
- USE ONLY double quotes (") for all properties and values
- JSON must be valid without special characters
- DO NOT use double quotes inside titles - use single quotes if necessary
- The JSON must be parseable directly without modifications`;

  try {
    const ai = getAIInstance();
    const model = ai.getGenerativeModel({ model: GEMINI_TEXT_MODEL_NAME });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: fallbackPrompt }] }],
      generationConfig: {
        temperature: 0.3, // Very low for conservative suggestions
        topK: 20,
        topP: 0.9,
        maxOutputTokens: 1024,
      },
    });

    const response = await result.response;
    const rawData = parseJsonFromGeminiResponse(response.text());

    // Validate response (same as main function)
    if (
      !rawData.title ||
      !rawData.description ||
      !Array.isArray(rawData.songs)
    ) {
      throw new Error(
        "AI fallback response is missing required fields (title, description, or songs)."
      );
    }

    if (rawData.songs.length === 0) {
      throw new Error("AI fallback returned no songs for the playlist.");
    }

    if (
      rawData.songs.some(
        (song) =>
          typeof song.title !== "string" || typeof song.artist !== "string"
      )
    ) {
      throw new Error(
        "AI fallback response for songs has an invalid format (title or artist is not a string)."
      );
    }

    // Ensure exactly 10 songs
    if (rawData.songs.length > 10) {
      rawData.songs = rawData.songs.slice(0, 10);
      console.log(
        `⚠️ Fallback AI returned ${rawData.songs.length} songs, trimmed to 10`
      );
    } else if (rawData.songs.length < 10) {
      console.log(`⚠️ Fallback AI returned only ${rawData.songs.length} songs`);
    }

    console.log(
      `✅ Generated fallback classical playlist: "${rawData.title}" with ${rawData.songs.length} songs`
    );
    return rawData;
  } catch (error) {
    console.error("Error generating fallback classical playlist:", error);
    throw new Error(`Failed to generate fallback playlist: ${error.message}`);
  }
}
