import axios from "axios";
import crypto from "crypto";
import querystring from "querystring";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_API_URL = "https://api.spotify.com/v1";

// Almacén temporal para estados de autenticación
const stateStore = new Map();

// Generar string aleatorio para state
function generateRandomString(length) {
  return crypto.randomBytes(length)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
    .substring(0, length);
}

// Inicia el flujo de autorización (redirección a Spotify)
export const initiateLogin = async (req, res) => {
  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({
        error: "SPOTIFY_CLIENT_ID no está configurado en el servidor",
      });
    }

    // Usar una URL base fija con 127.0.0.1 como exige Spotify para desarrollo local
    const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:3000";
    const redirect_uri = `${backendUrl}/api/spotify/callback`;

    const state = generateRandomString(16);

    // Guardar el state y el redirect_uri para validación posterior
    stateStore.set(state, {
      redirect_uri,
      timestamp: Date.now() + 10 * 60 * 1000, // 10 minutos
    });

    // Limpieza periódica de estados expirados
    setTimeout(() => {
      const now = Date.now();
      for (const [key, value] of stateStore.entries()) {
        if (value.timestamp < now) {
          stateStore.delete(key);
        }
      }
    }, 10 * 60 * 1000 + 1000); // Ejecutar un segundo después de la expiración

    const scope = [
      "user-read-private",
      "user-read-email",
      "playlist-modify-public",
      "playlist-modify-private",
      "playlist-read-private",
      "playlist-read-collaborative",
      "user-library-read",
      "user-library-modify",
    ].join(" ");

    const authUrl = new URL(SPOTIFY_AUTH_URL);
    const params = {
      response_type: "code",
      client_id: clientId,
      scope,
      redirect_uri,
      state,
      show_dialog: true,
    };

    authUrl.search = new URLSearchParams(params).toString();

    res.redirect(authUrl.toString());
  } catch (error) {
    console.error("Error iniciando autenticación con Spotify:", error);
    // Evitar enviar una respuesta JSON aquí. Si la redirección falla,
    // es mejor redirigir a una página de error del frontend.
    const frontendErrorUrl =
      process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(
      `${frontendErrorUrl}/auth-error?error=login_initiation_failed`
    );
  }
};

// Maneja el callback de Spotify
export const handleCallback = async (req, res) => {
  const { code, state, error } = req.query;

  // URL base del frontend para redirecciones
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  try {
    if (error) {
      console.error("Error en autorización de Spotify:", error);
      return res.redirect(
        `${frontendUrl}/auth-error?error=${encodeURIComponent(error)}`
      );
    }

    if (!state || !stateStore.has(state)) {
      console.error("Estado inválido o expirado:", state);
      return res.redirect(`${frontendUrl}/auth-error?error=invalid_state`);
    }

    const { redirect_uri } = stateStore.get(state);
    stateStore.delete(state);

    if (!code) {
      console.error("Código de autorización faltante");
      return res.redirect(`${frontendUrl}/auth-error?error=missing_code`);
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error("Credenciales de Spotify no configuradas");
      return res.redirect(
        `${frontendUrl}/auth-error?error=server_configuration`
      );
    }

    const authString = Buffer.from(
      `${clientId}:${clientSecret}`
    ).toString("base64");

    const tokenResponse = await axios.post(
      SPOTIFY_TOKEN_URL,
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri, // Usar el redirect_uri exacto de la solicitud inicial
      }).toString(), // Enviar como string para máxima compatibilidad
      {
        headers: {
          Authorization: `Basic ${authString}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    const userResponse = await axios.get("https://api.spotify.com/v1/me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const tokenData = {
      access_token,
      refresh_token,
      expires_in,
      user: userResponse.data,
    };

    const tokenString = encodeURIComponent(JSON.stringify(tokenData));
    res.redirect(`${frontendUrl}/auth-success#data=${tokenString}`);
  } catch (err) {
    console.error("Error procesando callback de Spotify:", err.response ? err.response.data : err.message);

    let errorMessage = "unknown_error";
    if (axios.isAxiosError(err) && err.response) {
      errorMessage = err.response.data?.error_description || err.response.data?.error || "token_exchange_failed";
    }

    res.redirect(
      `${frontendUrl}/auth-error?error=${encodeURIComponent(errorMessage)}`
    );
  }
};

// Refrescar token de acceso
export const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: "Refresh token requerido"
      });
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return res.status(500).json({
        error: "SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET no están configurados en el servidor"
      });
    }

    // Autenticación con credenciales de cliente
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    // Preparar los datos para refrescar el token
    const tokenData = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });

    const response = await axios.post(SPOTIFY_TOKEN_URL, tokenData, {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    // Enviar la respuesta del nuevo token al cliente
    res.json(response.data);

  } catch (error) {
    console.error('Error refrescando token:', error);
    
    if (axios.isAxiosError(error) && error.response) {
      return res.status(error.response.status).json({
        error: error.response.data?.error || 'Error del servidor de Spotify',
        error_description: error.response.data?.error_description
      });
    }

    res.status(500).json({
      error: 'Error interno del servidor al refrescar token'
    });
  }
};

// Validar token de acceso
export const validateToken = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: "Token de autorización requerido"
      });
    }

    const token = authHeader.substring(7); // Remover "Bearer "

    // Verificar el token haciendo una solicitud a la API de Spotify
    const response = await axios.get('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    res.json({
      valid: true,
      user: response.data
    });

  } catch (error) {
    console.error('Error validando token:', error);
    
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      return res.status(401).json({
        valid: false,
        error: "Token inválido o expirado"
      });
    }

    res.status(500).json({
      valid: false,
      error: 'Error interno del servidor al validar token'
    });
  }
}; 