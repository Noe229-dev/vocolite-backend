// routes/users.js
// Permet de consulter le profil PUBLIC de n'importe quel utilisateur
// (nom, avatar, ses publications, compteurs abonnes/abonnements, et si JE le suis deja).

const express = require('express');
const db = require('../database/db');
const { verifyToken } = require('./auth');

const router = express.Router();

// GET /api/users/:id - Profil public d'un utilisateur (soi-meme ou quelqu'un d'autre)
router.get('/:id', verifyToken, (req, res) => {
  try {
    const targetId = req.params.id;

    const user = db.prepare(
      'SELECT id, username, display_name, avatar_url, created_at FROM users WHERE id = ?'
    ).get(targetId);

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const followerCount = db.prepare(
      'SELECT COUNT(*) as count FROM follows WHERE following_id = ?'
    ).get(targetId).count;

    const followingCount = db.prepare(
      'SELECT COUNT(*) as count FROM follows WHERE follower_id = ?'
    ).get(targetId).count;

    const isFollowing = !!db.prepare(
      'SELECT id FROM follows WHERE follower_id = ? AND following_id = ?'
    ).get(req.user.id, targetId);

    const posts = db.prepare(`
      SELECT
        posts.id, posts.content_text, posts.media_url, posts.media_type, posts.created_at,
        (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) as like_count
      FROM posts
      WHERE posts.user_id = ?
      ORDER BY posts.created_at DESC
    `).all(targetId);

    res.json({
      user,
      followerCount,
      followingCount,
      isFollowing,
      isOwnProfile: targetId === req.user.id,
      posts
    });
  } catch (err) {
    console.error('Erreur GET /users/:id:', err);
    res.status(500).json({ error: 'Erreur serveur lors du chargement du profil.' });
  }
});

module.exports = router;
