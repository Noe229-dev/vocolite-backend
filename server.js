// server.js
// Point d'entree du backend VocoLite.
// Assemble toutes les routes (auth, posts, likes) et sert les fichiers uploades.

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const { router: authRouter } = require('./routes/auth');
const postsRouter = require('./routes/posts');
const likesRouter = require('./routes/likes');
const followsRouter = require('./routes/follows');
const usersRouter = require('./routes/users');
const messagesRouter = require('./routes/messages');

// S'assure que la base de donnees est initialisee des le demarrage
require('./database/db');

const app = express();
const PORT = process.env.PORT || 4031;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sert les images/videos uploadees de facon statique
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes de l'API
app.use('/api/auth', authRouter);
app.use('/api/posts', postsRouter);
app.use('/api/likes', likesRouter);
app.use('/api/follows', followsRouter);
app.use('/api/users', usersRouter);
app.use('/api/messages', messagesRouter);

// Route de sante pour verifier que le serveur tourne
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'VocoLite', message: 'Le serveur fonctionne.' });
});

// Gestion des erreurs non capturees (ex: fichier trop lourd via multer)
app.use((err, req, res, next) => {
  console.error('Erreur non geree:', err.message);
  res.status(500).json({ error: err.message || 'Erreur serveur inattendue.' });
});

app.listen(PORT, () => {
  console.log(`VocoLite backend demarre sur http://localhost:${PORT}`);
  console.log(`Test rapide : http://localhost:${PORT}/api/health`);
});
