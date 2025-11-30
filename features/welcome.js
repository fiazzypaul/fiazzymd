const fs = require('fs');
const path = require('path');

const dbDir = path.join(__dirname, '..', 'database');
const file = path.join(dbDir, 'welcome.json');

try { if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true }); } catch {}
try { if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({}), 'utf8'); } catch {}

function loadDB() {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function saveDB(db) {
  try { fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8'); } catch {}
}

function enableWelcome(jid) {
  const db = loadDB();
  db[jid] = { enabled: true };
  saveDB(db);
}

function disableWelcome(jid) {
  const db = loadDB();
  if (db[jid]) delete db[jid];
  saveDB(db);
}

function isWelcomeEnabled(jid) {
  const db = loadDB();
  return !!(db[jid] && db[jid].enabled);
}

function setWelcomeMessage(jid, text) {
  const db = loadDB();
  const current = db[jid] || { enabled: true };
  current.message = String(text || '').trim();
  db[jid] = current;
  saveDB(db);
}

function getWelcomeMessage(jid) {
  const db = loadDB();
  const msg = db[jid]?.message;
  return (msg && msg.length > 0) ? msg : `Welcome to the Group, @user 👋\n\nThank you for joining us. To get started:\n\nRead the community guidelines 📜\n\nIntroduce yourself briefly 🗣️\n\nWe hope you find value here.\n\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬ Powered by Fiazzy-MD`;
}

function validateWelcomeTemplate(text) {
  if (typeof text !== 'string') return { valid: false, reason: 'Message must be a string.' };
  const trimmed = text.trim();
  if (!trimmed) return { valid: false, reason: 'Message cannot be empty.' };
  if (!trimmed.includes('@user')) return { valid: false, reason: 'Message must include "@user" to mention the new member.' };
  return { valid: true };
}

async function sendWelcomeMessage(sock, groupJid, userJid) {
  const userId = typeof userJid === 'string' ? userJid : (userJid?.id || userJid?.jid || '');
  let ppUrl;
  try { ppUrl = await sock.profilePictureUrl(userId, 'image'); } catch { ppUrl = 'https://i.ibb.co/5FRncqp/Profile-Picture.jpg'; }
  const name = (userId || '').split('@')[0];
  let caption = getWelcomeMessage(groupJid);
  try {
    const meta = await sock.groupMetadata(groupJid);
    caption = caption.replace('{group}', meta?.subject || 'this group');
  } catch {}
  caption = caption.replace('@user', `@${name}`);
  await sock.sendMessage(groupJid, { image: { url: ppUrl }, caption, mentions: [userId], contextInfo: { forwardingScore: 1, isForwarded: true, forwardedNewsletterMessageInfo: { newsletterJid: '120363423276650635@newsletter', newsletterName: 'FIAZZY-MD', serverMessageId: -1 } } });
}

async function sendGoodbyeMessage(sock, groupJid, userJid) {
  const userId = typeof userJid === 'string' ? userJid : (userJid?.id || userJid?.jid || '');
  const name = (userId || '').split('@')[0];
  await sock.sendMessage(groupJid, { text: `👋 See ya, bye @${name}`, mentions: [userId] });
}

module.exports = {
  enableWelcome,
  disableWelcome,
  isWelcomeEnabled,
  setWelcomeMessage,
  getWelcomeMessage,
  validateWelcomeTemplate,
  sendWelcomeMessage,
  sendGoodbyeMessage,
};