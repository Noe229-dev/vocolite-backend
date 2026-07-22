// routes/messages.js
// Messagerie privee simple entre deux utilisateurs (pas de temps reel, actualisation manuelle/auto cote frontend).

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { verifyToken } = require('./auth');

const router = express.Router();

// GET /api/messages/conversations - Liste des discussions de l'utilisateur connecte,
// triee par message le plus recent, avec le dernier message et le nombre de non-lus.
router.get('/conversations', verifyToken, (req, res) => {
  try {
    const myId = req.user.id;

    const conversations = db.prepare(`
      SELECT
        u.id as user_id, u.username, u.display_name, u.avatar_url,
        lm.content as last_message, lm.created_at as last_message_at, lm.sender_id as last_sender_id,
        (
          SELECT COUNT(*) FROM messages
          WHERE sender_id = u.id AND receiver_id = ? AND is_read = 0
        ) as unread_count
      FROM users u
      JOIN (
        SELECT
          CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END as other_user_id,
          content, created_at, sender_id,
          ROW_NUMBER() OVER (
            PARTITION BY CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END
            ORDER BY created_at DESC
          ) as rn
        FROM messages
        WHERE sender_id = ? OR receiver_id = ?
      ) lm ON lm.other_user_id = u.id AND lm.rn = 1
      ORDER BY lm.created_at DESC
    `).all(myId, myId, myId, myId, myId);

    res.json({ conversations });
  } catch (err) {
    console.error('Erreur GET /messages/conversations:', err);
    res.status(500).json({ error: 'Erreur serveur lors du chargement des discussions.' });
  }
});

// GET /api/messages/:userId - Historique complet de la discussion avec un utilisateur donne.
// Marque automatiquement les messages recus comme lus.
router.get('/:userId', verifyToken, (req, res) => {
  try {
    const myId = req.user.id;
    const otherId = req.params.userId;

    const otherUser = db.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?').get(otherId);
    if (!otherUser) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const messages = db.prepare(`
      SELECT id, sender_id, receiver_id, content, created_at
      FROM messages
      WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
      ORDER BY created_at ASC
    `).all(myId, otherId, otherId, myId);

    // Marque comme lus tous les messages que l'autre m'a envoyes
    db.prepare(
      'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0'
    ).run(otherId, myId);

    res.json({ otherUser, messages });
  } catch (err) {
    console.error('Erreur GET /messages/:userId:', err);
    res.status(500).json({ error: 'Erreur serveur lors du chargement de la discussion.' });
  }
});

// POST /api/messages/:userId - Envoyer un message a un utilisateur
router.post('/:userId', verifyToken, (req, res) => {
  try {
    const myId = req.user.id;
    const otherId = req.params.userId;
    const { content } = req.body;

    if (otherId === myId) {
      return res.status(400).json({ error: 'Tu ne peux pas t\'envoyer un message a toi-meme.' });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Le message ne peut pas etre vide.' });
    }

    const otherUser = db.prepare('SELECT id FROM users WHERE id = ?').get(otherId);
    if (!otherUser) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    const id = uuidv4();
    db.prepare(
      'INSERT INTO messages (id, sender_id, receiver_id, content) VALUES (?, ?, ?, ?)'
    ).run(id, myId, otherId, content.trim());

    const message = db.prepare('SELECT id, sender_id, receiver_id, content, created_at FROM messages WHERE id = ?').get(id);

    res.status(201).json({ message });
  } catch (err) {
    console.error('Erreur POST /messages/:userId:', err);
    res.status(500).json({ error: 'Erreur serveur lors de l\'envoi du message.' });
  }
});

module.exports = router;
