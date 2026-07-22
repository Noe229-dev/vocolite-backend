// routes/posts.js
// Gere la creation et la lecture des publications.
// Fil chronologique global, pagination infinie par lots de 10 (comme Facebook).

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { verifyToken } = require('./auth');

const router = express.Router();

const POSTS_PER_PAGE = 10;

// Configuration de l'upload de fichiers (photos/videos), avec limite de taille
// pour rester leger en donnees (5 Mo max par fichier)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non supporte. Utilise JPG, PNG, WEBP, MP4 ou WEBM.'));
    }
  }
});

// GET /api/posts?offset=0
// Recupere le fil par lots de 10, sans limite totale (pagination infinie).
router.get('/', verifyToken, (req, res) => {
  try {
    const offset = parseInt(req.query.offset) || 0;

    const posts = db.prepare(`
      SELECT
        posts.id, posts.content_text, posts.media_url, posts.media_type, posts.created_at,
        users.id as user_id, users.username, users.display_name, users.avatar_url,
        (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) as like_count,
        (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id AND likes.user_id = ?) as liked_by_me
      FROM posts
      JOIN users ON users.id = posts.user_id
      ORDER BY posts.created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, POSTS_PER_PAGE, offset);

    const nextOffset = offset + posts.length;
    const reachedEnd = posts.length < POSTS_PER_PAGE; // plus rien a charger dans la base

    res.json({ posts, nextOffset, reachedEnd });
  } catch (err) {
    console.error('Erreur GET /posts:', err);
    res.status(500).json({ error: 'Erreur serveur lors du chargement du fil.' });
  }
});

// GET /api/posts/mine - Recupere uniquement les publications de l'utilisateur connecte (page profil)
// Cette route n'est pas limitee a 30, car c'est l'historique personnel, pas le fil principal anti-scroll.
router.get('/mine', verifyToken, (req, res) => {
  try {
    const posts = db.prepare(`
      SELECT
        posts.id, posts.content_text, posts.media_url, posts.media_type, posts.created_at,
        (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) as like_count
      FROM posts
      WHERE posts.user_id = ?
      ORDER BY posts.created_at DESC
    `).all(req.user.id);

    res.json({ posts });
  } catch (err) {
    console.error('Erreur GET /posts/mine:', err);
    res.status(500).json({ error: 'Erreur serveur lors du chargement de tes publications.' });
  }
});

// POST /api/posts - Creer une publication (texte seul, ou avec photo/video)
// MODE FAIBLE DATA : chaque photo envoyee est automatiquement compressee
// (redimensionnee a 1080px max, qualite 65%) avant d'etre stockee. Ca reduit
// le poids des images de 70-90% en general, donc moins de data consommee
// par tous ceux qui verront la publication plus tard.
router.post('/', verifyToken, upload.single('media'), async (req, res) => {
  try {
    const { content_text } = req.body;

    if (!content_text && !req.file) {
      return res.status(400).json({ error: 'Une publication doit contenir du texte ou un media.' });
    }

    const id = uuidv4();
    let media_url = null;
    let media_type = null;

    if (req.file) {
      const isImage = req.file.mimetype.startsWith('image');

      if (isImage) {
        // On compresse et on remplace le fichier original par une version legere en .jpg
        const originalPath = req.file.path;
        const compressedFilename = `${path.parse(req.file.filename).name}.jpg`;
        const compressedPath = path.join(path.dirname(originalPath), compressedFilename);

        await sharp(originalPath)
          .resize({ width: 1080, height: 1080, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 65 })
          .toFile(compressedPath);

        fs.unlinkSync(originalPath); // on supprime l'original non-compresse
        media_url = `/uploads/${compressedFilename}`;
        media_type = 'image';
      } else {
        // Les videos ne sont pas recompressees ici (deja limitees a 5 Mo par multer)
        media_url = `/uploads/${req.file.filename}`;
        media_type = 'video';
      }
    }

    db.prepare(
      'INSERT INTO posts (id, user_id, content_text, media_url, media_type) VALUES (?, ?, ?, ?, ?)'
    ).run(id, req.user.id, content_text || null, media_url, media_type);

    res.status(201).json({ message: 'Publication creee.', post: { id, content_text, media_url, media_type } });
  } catch (err) {
    console.error('Erreur POST /posts:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la publication.' });
  }
});

// DELETE /api/posts/:id - Supprimer sa propre publication
router.delete('/:id', verifyToken, (req, res) => {
  try {
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);

    if (!post) {
      return res.status(404).json({ error: 'Publication introuvable.' });
    }
    if (post.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Tu ne peux supprimer que tes propres publications.' });
    }

    db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
    res.json({ message: 'Publication supprimee.' });
  } catch (err) {
    console.error('Erreur DELETE /posts:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la suppression.' });
  }
});

module.exports = router;
