import express from 'express';
import * as spotifyAuthController from '../controllers/spotifyAuthController.js';

const router = express.Router();

// Rutas de autenticación de Spotify
router.get('/login', spotifyAuthController.initiateLogin);
router.get('/callback', spotifyAuthController.handleCallback);
router.post('/refresh', spotifyAuthController.refreshAccessToken);
router.get('/validate', spotifyAuthController.validateToken);

export default router; 