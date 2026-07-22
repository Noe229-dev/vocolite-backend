// routes/auth.js
// Gere l'inscription, la verification par email, et la connexion.
// Un compte non verifie ne peut pas se connecter.

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const { sendVerificationEmail } = require('../utils/mailer');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'vocolite_secret_dev_a_changer';
const CODE_VALIDITY_MINUTES = 15;

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // code a 6 chiffres
}

// POST /api/auth/register - Creer un compte (non verifie au depart)
// Le numero de telephone est optionnel : il servira plus tard a retrouver des amis
// deja inscrits via leurs contacts telephone. Aucune verification par SMS pour l'instant
// (seul l'email est verifie par code, comme avant).
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, display_name, phone_number } = req.body;

    if (!username || !email || !password || !display_name) {
      return res.status(400).json({ error: 'Nom d\'utilisateur, email, mot de passe et nom d\'affichage requis.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Adresse email invalide.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caracteres.' });
    }

    // Le numero est optionnel, mais s'il est fourni on verifie un format minimal
    let cleanedPhone = null;
    if (phone_number && phone_number.trim()) {
      cleanedPhone = phone_number.trim();
      const phoneRegex = /^[+0-9\s.-]{6,20}$/;
      if (!phoneRegex.test(cleanedPhone)) {
        return res.status(400).json({ error: 'Numero de telephone invalide.' });
      }
    }

    const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUsername) {
      return res.status(409).json({ error: 'Ce nom d\'utilisateur est deja pris.' });
    }

    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingEmail) {
      return res.status(409).json({ error: 'Cet email est deja utilise.' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    const code = generateCode();
    const expires = new Date(Date.now() + CODE_VALIDITY_MINUTES * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO users (id, username, email, phone_number, password_hash, display_name, is_verified, verification_code, verification_expires)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, username, email, cleanedPhone, password_hash, display_name, code, expires);

    await sendVerificationEmail(email, code);

    console.log(`📝 Nouveau compte cree : ${username} (${email}) - en attente de verification`);

    res.status(201).json({
      message: 'Compte cree. Verifie ton email pour activer ton compte.',
      email
    });
  } catch (err) {
    console.error('Erreur register:', err);
    res.status(500).json({ error: 'Erreur serveur lors de l\'inscription.' });
  }
});

// POST /api/auth/verify - Valider le code recu par email
router.post('/verify', (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email et code requis.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(404).json({ error: 'Compte introuvable.' });
    }

    if (user.is_verified) {
      return res.status(400).json({ error: 'Ce compte est deja verifie.' });
    }

    if (user.verification_code !== code) {
      return res.status(400).json({ error: 'Code incorrect.' });
    }

    if (new Date(user.verification_expires) < new Date()) {
      return res.status(400).json({ error: 'Code expire. Demande un nouveau code.' });
    }

    db.prepare('UPDATE users SET is_verified = 1, verification_code = NULL WHERE id = ?').run(user.id);

    console.log(`✅ Compte verifie : ${user.username} (${user.email})`);

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      message: 'Compte verifie avec succes.',
      token,
      user: { id: user.id, username: user.username, display_name: user.display_name }
    });
  } catch (err) {
    console.error('Erreur verify:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la verification.' });
  }
});

// POST /api/auth/resend-code - Renvoyer un nouveau code si expire
router.post('/resend-code', async (req, res) => {
  try {
    const { email } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(404).json({ error: 'Compte introuvable.' });
    }
    if (user.is_verified) {
      return res.status(400).json({ error: 'Ce compte est deja verifie.' });
    }

    const code = generateCode();
    const expires = new Date(Date.now() + CODE_VALIDITY_MINUTES * 60 * 1000).toISOString();

    db.prepare('UPDATE users SET verification_code = ?, verification_expires = ? WHERE id = ?')
      .run(code, expires, user.id);

    await sendVerificationEmail(email, code);

    res.json({ message: 'Nouveau code envoye.' });
  } catch (err) {
    console.error('Erreur resend-code:', err);
    res.status(500).json({ error: 'Erreur serveur lors du renvoi du code.' });
  }
});

// POST /api/auth/login - Se connecter (uniquement si compte verifie)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }

    if (!user.is_verified) {
      return res.status(403).json({
        error: 'Compte non verifie. Verifie ton email.',
        needsVerification: true,
        email: user.email
      });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });

    console.log(`🔓 Connexion : ${user.username} (${user.email}) - ${new Date().toLocaleString('fr-FR')}`);

    res.json({
      message: 'Connexion reussie.',
      token,
      user: { id: user.id, username: user.username, display_name: user.display_name, avatar_url: user.avatar_url }
    });
  } catch (err) {
    console.error('Erreur login:', err);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion.' });
  }
});

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token manquant. Connecte-toi d\'abord.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide ou expire.' });
    }
    req.user = decoded;
    next();
  });
}

module.exports = { router, verifyToken };
