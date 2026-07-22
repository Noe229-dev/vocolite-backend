// utils/mailer.js
// Envoie des emails via un compte Gmail, en utilisant un "mot de passe d'application".
//
// COMMENT OBTENIR UN MOT DE PASSE D'APPLICATION GMAIL (a faire une seule fois, avec internet) :
// 1. Va sur https://myaccount.google.com/security
// 2. Active la "Validation en deux etapes" si ce n'est pas deja fait
// 3. Cherche "Mots de passe des applications" (App passwords)
// 4. Cree-en un pour "VocoLite", copie le code de 16 caracteres genere
// 5. Mets cet email et ce code dans les variables d'environnement (voir README)

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,       // ton adresse Gmail complete
    pass: process.env.GMAIL_APP_PASSWORD // le mot de passe d'application (16 caracteres)
  }
});

async function sendVerificationEmail(toEmail, code) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('⚠️ GMAIL_USER / GMAIL_APP_PASSWORD non configures. Email non envoye.');
    console.warn(`Code de verification pour ${toEmail} (mode debug) : ${code}`);
    return { simulated: true };
  }

  return transporter.sendMail({
    from: `"VocoLite" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: 'Ton code de verification VocoLite',
    text: `Ton code de verification VocoLite est : ${code}\n\nCe code expire dans 15 minutes.`,
    html: `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2 style="color: #6C5CE7;">Bienvenue sur VocoLite</h2>
        <p>Voici ton code de verification :</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
        <p style="color: #888;">Ce code expire dans 15 minutes.</p>
      </div>
    `
  });
}

module.exports = { sendVerificationEmail };
