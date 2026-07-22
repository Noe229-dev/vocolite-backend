// database/db.js
// Gere la connexion a la base de donnees SQLite et cree les tables si elles n'existent pas.
// SQLite = un seul fichier, pas besoin d'installer un serveur de base de donnees separe.
// Ideal pour une connexion internet limitee.

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'vocolite-social.db');
const db = new Database(dbPath);

// Active les cles etrangeres (integrite des donnees entre tables)
db.pragma('foreign_keys = ON');

// Table des utilisateurs
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone_number TEXT,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    is_verified INTEGER DEFAULT 0,
    verification_code TEXT,
    verification_expires TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Si la base existait deja avant l'ajout du numero de telephone, on ajoute la colonne
// sans effacer les comptes existants (SQLite ignore l'erreur si la colonne existe deja).
try {
  db.exec(`ALTER TABLE users ADD COLUMN phone_number TEXT`);
} catch (e) {
  // La colonne existe deja, rien a faire
}

// Table des publications (texte, photo ou video courte)
db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content_text TEXT,
    media_url TEXT,
    media_type TEXT CHECK(media_type IN ('image', 'video', NULL)),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Table des likes (un utilisateur ne peut liker un post qu'une seule fois)
db.exec(`
  CREATE TABLE IF NOT EXISTS likes (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(post_id, user_id)
  )
`);

// Table des abonnements (qui suit qui) - independante du fil principal,
// utilisee uniquement sur les pages de profil pour l'instant.
db.exec(`
  CREATE TABLE IF NOT EXISTS follows (
    id TEXT PRIMARY KEY,
    follower_id TEXT NOT NULL,
    following_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(follower_id, following_id)
  )
`);

// Table des messages prives (discussions entre deux utilisateurs)
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    content TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Index pour accelerer les requetes frequentes (charger le fil, compter les likes)
db.exec(`CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)`);

console.log('Base de donnees VocoLite prete :', dbPath);

module.exports = db;
