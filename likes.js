// routes/likes.js
// Gere le fait de liker / unliker une publication.
// Les likes sont VISIBLES (choix fait pour VocoLite), contrairement a certaines apps qui les cachent.

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { verifyToken } = require('./auth');

const router = express.Router();

// POST /api/likes/:postId - Liker une publication
router.post('/:postId', verifyToken, (req, res) => {
  try {
    const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.postId);
    if (!post) {
      return res.status(404).json({ error: 'Publication introuvable.' });
    }

    const existing = db.prepare(
      'SELECT id FROM likes WHERE post_id = ? AND user_id = ?'
    ).get(req.params.postId, req.user.id);

    if (existing) {
      return res.status(409).json({ error: 'Tu as deja like cette publication.' });
    }

    const id = uuidv4();
    db.prepare(
      'INSERT INTO likes (id, post_id, user_id) VALUES (?, ?, ?)'
    ).run(id, req.params.postId, req.user.id);

    const like_count = db.prepare(
      'SELECT COUNT(*) as count FROM likes WHERE post_id = ?'
    ).get(req.params.postId).count;

    res.status(201).json({ message: 'Publication likee.', like_count });
  } catch (err) {
    console.error('Erreur POST /likes:', err);
    res.status(500).json({ error: 'Erreur serveur lors du like.' });
  }
});

// DELETE /api/likes/:postId - Retirer son like
router.delete('/:postId', verifyToken, (req, res) => {
  try {
    db.prepare(
      'DELETE FROM likes WHERE post_id = ? AND user_id = ?'
    ).run(req.params.postId, req.user.id);

    const like_count = db.prepare(
      'SELECT COUNT(*) as count FROM likes WHERE post_id = ?'
    ).get(req.params.postId).count;

    res.json({ message: 'Like retire.', like_count });
  } catch (err) {
    console.error('Erreur DELETE /likes:', err);
    res.status(500).json({ error: 'Erreur serveur lors du retrait du like.' });
  }
});

module.exports = router;
