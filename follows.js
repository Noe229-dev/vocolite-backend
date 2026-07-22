// routes/follows.js
// Gere le "suivre / ne plus suivre" entre utilisateurs.
// IMPORTANT : ceci ne change PAS le fil principal (toujours global, 30 posts max).
// C'est uniquement affiche sur les pages de profil (bouton + compteurs abonnes/abonnements).

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { verifyToken } = require('./auth');

const router = express.Router();

// POST /api/follows/:userId - Suivre quelqu'un
router.post('/:userId', verifyToken, (req, res) => {
  try {
    const targetId = req.params.userId;

    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'Tu ne peux pas te suivre toi-meme.' });
    }

    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
    if (!target) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const already = db.prepare(
      'SELECT id FROM follows WHERE follower_id = ? AND following_id = ?'
    ).get(req.user.id, targetId);

    if (already) {
      return res.status(200).json({ message: 'Deja abonne.', following: true });
    }

    db.prepare(
      'INSERT INTO follows (id, follower_id, following_id) VALUES (?, ?, ?)'
    ).run(uuidv4(), req.user.id, targetId);

    res.status(201).json({ message: 'Abonnement reussi.', following: true });
  } catch (err) {
    console.error('Erreur POST /follows:', err);
    res.status(500).json({ error: 'Erreur serveur lors de l\'abonnement.' });
  }
});

// DELETE /api/follows/:userId - Ne plus suivre quelqu'un
router.delete('/:userId', verifyToken, (req, res) => {
  try {
    db.prepare(
      'DELETE FROM follows WHERE follower_id = ? AND following_id = ?'
    ).run(req.user.id, req.params.userId);

    res.json({ message: 'Desabonnement reussi.', following: false });
  } catch (err) {
    console.error('Erreur DELETE /follows:', err);
    res.status(500).json({ error: 'Erreur serveur lors du desabonnement.' });
  }
});

module.exports = router;
